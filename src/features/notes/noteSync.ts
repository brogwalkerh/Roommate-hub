// Autosave with optimistic concurrency for one open note, with no React in it.
//
// The editor keeps three things: `draft` (what is on screen), `synced` (the
// text the server had when we last loaded or saved) and `base` (that version's
// `updated_at`). Every save is "update ... where id = ? and updated_at = base".
// If that matches no row, someone else saved in between, and we fetch the row to
// find out what happened:
//   - the text there is still `synced`: only metadata changed (a pin toggle bumps
//     updated_at). Adopt the new `base` and save again, no questions asked.
//   - the text there is already our draft: nothing to do.
//   - otherwise it is a real conflict: pause saving and let the person choose.
// Changes from the server (realtime) load silently while there are no unsaved
// edits, and wait for the next save to be reconciled when there are.

import { compareTimestamps, isNewer } from './timestamps'
import type { Note, NoteContent } from './api'

export const DEBOUNCE_MS = 800
const RETRY_FIRST_MS = 2_000
const RETRY_MAX_MS = 30_000
/** Save, re-base and save again, at most this many times in one go. */
const MAX_ATTEMPTS = 4

export type SyncState = 'saved' | 'saving' | 'error' | 'conflict'

export type EditorView = {
  draft: NoteContent
  state: SyncState
  /** Your roommate's version while the "changed this note while you were editing" banner is up. */
  conflict: Note | null
  /** Someone deleted the note while it was open. */
  gone: boolean
}

export type SyncDeps = {
  /** Update the note; with a base, only if updated_at still equals it. Null means no row matched. */
  save: (id: string, content: NoteContent, base: string | null) => Promise<Note | null>
  fetch: (id: string) => Promise<Note | null>
  /** A row we know is the server's latest (after a save, or a fetched conflict): update the caches. */
  onRow: (row: Note) => void
  /** Called when the editor closes with changes that could not be saved. */
  onLostEdits?: () => void
}

export const sameContent = (a: NoteContent, b: NoteContent) => a.title === b.title && a.body === b.body
const pick = (n: NoteContent): NoteContent => ({ title: n.title, body: n.body })

export type RemoteAction = 'ignore' | 'defer' | 'rebase' | 'load' | 'update-conflict'

/** What to do with a row that arrived from the server (realtime refetch, pin toggle, ...). */
export function classifyRemote(
  state: { base: string; synced: NoteContent; draft: NoteContent; saving: boolean; conflict: Note | null },
  row: Note,
): RemoteAction {
  if (state.conflict) return isNewer(row.updated_at, state.conflict.updated_at) ? 'update-conflict' : 'ignore'
  // Rows at or before our version are echoes of our own saves, or stale refetches.
  if (!isNewer(row.updated_at, state.base)) return 'ignore'
  // The save in flight decides how this row relates to ours; look again afterwards.
  if (state.saving) return 'defer'
  // Same text, newer timestamp: a pin toggle or similar. Keep editing on top of it.
  if (sameContent(row, state.synced)) return 'rebase'
  // Their text changed and we have nothing unsaved: show theirs.
  if (sameContent(state.draft, state.synced)) return 'load'
  // Their text changed and so did ours: the next save will detect it and ask.
  return 'defer'
}

/** "<name> changed this note while you were editing." */
export function conflictMessage(
  theirs: Pick<Note, 'updated_by'>,
  meId: string | null | undefined,
  nameOf: (id: string | null) => string | null | undefined,
): string {
  if (theirs.updated_by && theirs.updated_by === meId) {
    return 'This note changed on another device while you were editing.'
  }
  return `${nameOf(theirs.updated_by) ?? 'Your roommate'} changed this note while you were editing.`
}

type Outcome =
  | { kind: 'saved'; row: Note; content: NoteContent }
  | { kind: 'conflict'; theirs: Note }
  | { kind: 'gone' }
  | { kind: 'error' }

export function createNoteSync(initial: Note, deps: SyncDeps) {
  const id = initial.id
  let onLostEdits = deps.onLostEdits
  let base = initial.updated_at
  let synced = pick(initial)
  let draft = pick(initial)
  let conflict: Note | null = null
  let gone = false
  let abandoned = false
  let disposed = false
  let saving = false
  let failed = false
  let failures = 0
  /** "Keep my version" was chosen and has not been saved yet: save without the updated_at check. */
  let overwriteNext = false
  /** A save was asked for while another was in flight. */
  let rerun = false
  /** The newest server row that arrived while we could not act on it. */
  let pendingRemote: Note | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<() => void>()

  const dirty = () => !sameContent(draft, synced)

  function computeView(): EditorView {
    const state: SyncState = conflict ? 'conflict' : failed ? 'error' : saving || dirty() ? 'saving' : 'saved'
    return { draft, state, conflict, gone }
  }
  let view = computeView()

  function emit() {
    view = computeView()
    listeners.forEach((listener) => listener())
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function setTimer(ms: number) {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void run()
    }, ms)
  }

  async function persist(): Promise<Outcome> {
    try {
      let overwrite = overwriteNext
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const content = pick(draft)
        const row = await deps.save(id, content, overwrite ? null : base)
        if (row) return { kind: 'saved', row, content }

        // No row matched. Find out why.
        const theirs = await deps.fetch(id)
        if (!theirs) return { kind: 'gone' }
        if (overwrite) return { kind: 'error' } // the row exists but would not take the write
        if (compareTimestamps(theirs.updated_at, base) === 0) {
          // The version check failed although nothing changed since we loaded: write over our own version.
          overwrite = true
          continue
        }
        if (sameContent(theirs, synced)) {
          base = theirs.updated_at // only metadata changed (pin): carry on from the new version
          continue
        }
        if (sameContent(theirs, content)) return { kind: 'saved', row: theirs, content } // they saved exactly what we have
        return { kind: 'conflict', theirs }
      }
      return { kind: 'error' }
    } catch {
      return { kind: 'error' }
    }
  }

  async function run(): Promise<void> {
    if (gone || abandoned) return
    if (saving) {
      rerun = true
      return
    }
    if (conflict) return
    if (!dirty() && !overwriteNext) {
      failed = false
      emit()
      return
    }

    clearTimer()
    saving = true
    failed = false
    emit()

    const outcome = await persist()
    saving = false

    switch (outcome.kind) {
      case 'saved':
        base = outcome.row.updated_at
        synced = outcome.content
        overwriteNext = false
        failed = false
        failures = 0
        deps.onRow(outcome.row)
        break
      case 'conflict':
        conflict = outcome.theirs
        break
      case 'gone':
        gone = true
        break
      case 'error':
        failed = true
        failures += 1
        if (!disposed && timer === null) {
          setTimer(Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** (failures - 1)))
        }
        break
    }
    emit()

    if (disposed && dirty() && (outcome.kind === 'error' || outcome.kind === 'conflict')) {
      onLostEdits?.()
    }

    if (outcome.kind === 'saved') {
      if (pendingRemote) {
        const row = pendingRemote
        pendingRemote = null
        observe(row)
      }
      if (rerun) {
        rerun = false
        void run()
      }
    } else {
      rerun = false
    }
  }

  /** Feed in a row fetched from the server (query data changed, pin toggled, ...). */
  function observe(row: Note) {
    if (row.id !== id || gone) return
    switch (classifyRemote({ base, synced, draft, saving, conflict }, row)) {
      case 'ignore':
        return
      case 'defer':
        if (!pendingRemote || isNewer(row.updated_at, pendingRemote.updated_at)) pendingRemote = row
        return
      case 'rebase':
        base = row.updated_at
        break
      case 'load':
        base = row.updated_at
        synced = pick(row)
        draft = pick(row)
        break
      case 'update-conflict':
        conflict = row
        break
    }
    emit()
  }

  /** Change the title and/or body. Saves after a short pause, or right away with `immediate`. */
  function edit(patch: Partial<NoteContent>, options: { immediate?: boolean } = {}) {
    if (gone || abandoned) return
    const next = { ...draft, ...patch }
    if (sameContent(next, draft)) return
    draft = next

    if (!dirty() && pendingRemote && !saving && !conflict) {
      // Edited back to what is saved while the server moved on: catch up now.
      const row = pendingRemote
      pendingRemote = null
      observe(row)
    }
    if (!dirty() && !overwriteNext) {
      failed = false
      clearTimer()
    }
    emit()

    if (conflict) return // paused until the person picks a side
    if (options.immediate) void run()
    else if (dirty()) setTimer(DEBOUNCE_MS)
  }

  /** Save now (blur, tab hidden, back online). */
  function flush(): Promise<void> {
    clearTimer()
    return run()
  }

  /** Conflict banner: save my text over theirs. */
  function keepMine() {
    if (!conflict) return
    conflict = null
    overwriteNext = true
    void run()
  }

  /** Conflict banner: drop my edits and show theirs. */
  function loadTheirs() {
    const theirs = conflict
    if (!theirs) return
    conflict = null
    pendingRemote = null
    overwriteNext = false
    failed = false
    failures = 0
    clearTimer()
    base = theirs.updated_at
    synced = pick(theirs)
    draft = pick(theirs)
    deps.onRow(theirs)
    emit()
  }

  /** Stop all saving, for a note that is about to be deleted. */
  function abandon() {
    abandoned = true
    clearTimer()
  }

  function start() {
    disposed = false
  }

  /** Replace the "closed with unsaved edits" handler (it needs the current toast function). */
  function setOnLostEdits(handler: (() => void) | undefined) {
    onLostEdits = handler
  }

  /** The editor is closing: send any last edits. */
  function dispose() {
    disposed = true
    clearTimer()
    if (gone || abandoned) return
    if (conflict) {
      if (dirty()) onLostEdits?.()
      return
    }
    if (dirty() || overwriteNext) void run()
  }

  return {
    id,
    getView: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    observe,
    edit,
    flush,
    keepMine,
    loadTheirs,
    abandon,
    start,
    setOnLostEdits,
    dispose,
  }
}

export type NoteSync = ReturnType<typeof createNoteSync>
