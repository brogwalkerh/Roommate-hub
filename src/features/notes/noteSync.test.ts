import type { Note, NoteContent } from './api'
import { classifyRemote, conflictMessage, createNoteSync, DEBOUNCE_MS, type SyncDeps } from './noteSync'

const ME = 'user-me'
const ROOMMATE = 'user-roommate'

const stamp = (n: number) => `2026-10-15T10:00:00.${String(n).padStart(6, '0')}+00:00`

function makeNote(patch: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Groceries',
    body: '- milk',
    pinned: false,
    created_by: ME,
    updated_by: ME,
    created_at: stamp(0),
    updated_at: stamp(1),
    ...patch,
  }
}

/** A tiny stand-in for the notes table, with the same updated_at check and trigger as Postgres. */
function makeServer(initial: Note = makeNote()) {
  let row: Note | null = initial
  let clock = 1
  const state = {
    failNext: 0,
    get row() {
      return row
    },
    /** What the roommate (or a trigger) does to the row. */
    changeAs(userId: string, patch: Partial<Pick<Note, 'title' | 'body' | 'pinned'>>) {
      if (!row) throw new Error('deleted')
      row = { ...row, ...patch, updated_by: userId, updated_at: stamp(++clock) }
      return row
    },
    delete() {
      row = null
    },
  }
  const deps = {
    save: vi.fn(async (_id: string, content: NoteContent, base: string | null) => {
      if (state.failNext > 0) {
        state.failNext -= 1
        throw new Error('Failed to fetch')
      }
      if (!row || (base !== null && base !== row.updated_at)) return null
      row = { ...row, ...content, updated_by: ME, updated_at: stamp(++clock) }
      return row
    }),
    fetch: vi.fn(async () => row),
    onRow: vi.fn(),
    onLostEdits: vi.fn(),
  } satisfies SyncDeps
  return { state, deps }
}

function setup(initial: Note = makeNote()) {
  const server = makeServer(initial)
  const sync = createNoteSync(initial, server.deps)
  sync.start()
  return { sync, ...server }
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('autosave', () => {
  it('starts out saved with the note loaded', () => {
    const { sync } = setup()
    expect(sync.getView()).toMatchObject({ draft: { title: 'Groceries', body: '- milk' }, state: 'saved', conflict: null, gone: false })
  })

  it('waits for a pause in typing, then saves once', async () => {
    const { sync, deps } = setup()
    sync.edit({ body: '- milk\n- e' })
    expect(sync.getView().state).toBe('saving')
    await advance(DEBOUNCE_MS - 100)
    sync.edit({ body: '- milk\n- eggs' })
    await advance(DEBOUNCE_MS - 100)
    expect(deps.save).not.toHaveBeenCalled()
    await advance(200)
    expect(deps.save).toHaveBeenCalledTimes(1)
    expect(deps.save).toHaveBeenCalledWith('note-1', { title: 'Groceries', body: '- milk\n- eggs' }, stamp(1))
    expect(sync.getView().state).toBe('saved')
    expect(deps.onRow).toHaveBeenCalledWith(expect.objectContaining({ body: '- milk\n- eggs', updated_at: stamp(2) }))
  })

  it('saves right away on flush (blur) and on immediate edits', async () => {
    const { sync, deps } = setup()
    sync.edit({ title: 'Shopping' })
    await sync.flush()
    expect(deps.save).toHaveBeenCalledTimes(1)
    sync.edit({ body: '- [x] milk' }, { immediate: true })
    await advance(0)
    expect(deps.save).toHaveBeenCalledTimes(2)
    await advance(DEBOUNCE_MS * 2)
    expect(deps.save).toHaveBeenCalledTimes(2)
  })

  it('does nothing when there is nothing to save', async () => {
    const { sync, deps } = setup()
    await sync.flush()
    sync.edit({ title: 'Groceries' })
    sync.edit({ body: '- milk' })
    await advance(DEBOUNCE_MS * 2)
    expect(deps.save).not.toHaveBeenCalled()
  })

  it('does not save when an edit is typed back to the saved text', async () => {
    const { sync, deps } = setup()
    sync.edit({ body: '- milk!' })
    sync.edit({ body: '- milk' })
    expect(sync.getView().state).toBe('saved')
    await advance(DEBOUNCE_MS * 2)
    expect(deps.save).not.toHaveBeenCalled()
  })

  it('chains saves on the version the last save returned', async () => {
    const { sync, deps } = setup()
    sync.edit({ body: 'one' })
    await advance(DEBOUNCE_MS)
    sync.edit({ body: 'two' })
    await advance(DEBOUNCE_MS)
    expect(deps.save.mock.calls.map((c) => c[2])).toEqual([stamp(1), stamp(2)])
    expect(sync.getView().state).toBe('saved')
  })

  it('keeps edits made while a save is in flight and saves them next', async () => {
    const { sync, deps, state } = setup()
    let release: () => void = () => {}
    const original = deps.save.getMockImplementation()!
    deps.save.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => (release = resolve))
      return original(...args)
    })

    sync.edit({ body: 'first' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView().state).toBe('saving')
    sync.edit({ body: 'first, then more' })
    await advance(DEBOUNCE_MS * 2) // the debounce fires while the first save is still out
    expect(deps.save).toHaveBeenCalledTimes(1)

    release()
    await advance(0)
    expect(deps.save).toHaveBeenCalledTimes(2)
    expect(deps.save.mock.calls[1][1].body).toBe('first, then more')
    expect(deps.save.mock.calls[1][2]).toBe(stamp(2))
    expect(state.row?.body).toBe('first, then more')
    expect(sync.getView().state).toBe('saved')
  })

  it('sends the last edits when the editor closes', async () => {
    const { sync, deps } = setup()
    sync.edit({ body: 'typed just before leaving' })
    sync.dispose()
    await advance(0)
    expect(deps.save).toHaveBeenCalledTimes(1)
    expect(deps.save.mock.calls[0][1].body).toBe('typed just before leaving')
    await advance(DEBOUNCE_MS * 2)
    expect(deps.save).toHaveBeenCalledTimes(1)
  })

  it('tells the person when closing could not save', async () => {
    const { sync, deps, state } = setup()
    state.failNext = 1
    sync.edit({ body: 'lost?' })
    sync.dispose()
    await advance(0)
    expect(deps.onLostEdits).toHaveBeenCalledTimes(1)
    await advance(60_000) // and it does not keep retrying in the background
    expect(deps.save).toHaveBeenCalledTimes(1)
  })

  it('can start again after a dispose (React strict mode)', async () => {
    const { sync, deps } = setup()
    sync.dispose()
    sync.start()
    sync.edit({ body: 'still works' })
    await advance(DEBOUNCE_MS)
    expect(deps.save).toHaveBeenCalledTimes(1)
  })

  it('stops for good after abandon (note being deleted)', async () => {
    const { sync, deps } = setup()
    sync.edit({ body: 'about to be deleted' })
    sync.abandon()
    sync.dispose()
    await advance(DEBOUNCE_MS * 2)
    expect(deps.save).not.toHaveBeenCalled()
  })
})

describe('save failures', () => {
  it('shows an error, retries with backoff and recovers', async () => {
    const { sync, deps, state } = setup()
    state.failNext = 2
    sync.edit({ body: 'offline edit' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView().state).toBe('error')
    expect(deps.save).toHaveBeenCalledTimes(1)

    await advance(2_000) // first retry
    expect(deps.save).toHaveBeenCalledTimes(2)
    expect(sync.getView().state).toBe('error')

    await advance(3_999) // second retry waits 4 s
    expect(deps.save).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(deps.save).toHaveBeenCalledTimes(3)
    expect(sync.getView().state).toBe('saved')
    expect(state.row?.body).toBe('offline edit')
  })

  it('retries at once when asked to flush (back online)', async () => {
    const { sync, deps, state } = setup()
    state.failNext = 1
    sync.edit({ body: 'x' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView().state).toBe('error')
    await sync.flush()
    expect(deps.save).toHaveBeenCalledTimes(2)
    expect(sync.getView().state).toBe('saved')
  })

  it('treats an error while fetching the current row as a failed save', async () => {
    const { sync, deps, state } = setup()
    state.changeAs(ROOMMATE, { body: 'theirs' })
    deps.fetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    sync.edit({ body: 'mine' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView().state).toBe('error')
    await advance(2_000)
    expect(sync.getView().state).toBe('conflict')
  })

  it('clears the error when the text goes back to what is saved', async () => {
    const { sync, state } = setup()
    state.failNext = 1
    sync.edit({ body: 'x' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView().state).toBe('error')
    sync.edit({ body: '- milk' })
    expect(sync.getView().state).toBe('saved')
  })
})

describe('conflicts', () => {
  it('flags a roommate save in between and pauses autosave', async () => {
    const { sync, deps, state } = setup()
    state.changeAs(ROOMMATE, { body: '- milk\n- bread' })
    sync.edit({ body: '- milk\n- eggs' })
    await advance(DEBOUNCE_MS)

    const view = sync.getView()
    expect(view.state).toBe('conflict')
    expect(view.conflict).toMatchObject({ body: '- milk\n- bread', updated_by: ROOMMATE })
    expect(view.draft.body).toBe('- milk\n- eggs')
    expect(deps.save).toHaveBeenCalledTimes(1)

    sync.edit({ body: '- milk\n- eggs\n- jam' })
    await advance(DEBOUNCE_MS * 3)
    expect(deps.save).toHaveBeenCalledTimes(1)
    expect(sync.getView().draft.body).toBe('- milk\n- eggs\n- jam')
  })

  it('"Keep my version" saves without the updated_at check', async () => {
    const { sync, deps, state } = setup()
    state.changeAs(ROOMMATE, { body: 'theirs' })
    sync.edit({ body: 'mine' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView().state).toBe('conflict')

    sync.keepMine()
    await advance(0)
    expect(deps.save).toHaveBeenLastCalledWith('note-1', { title: 'Groceries', body: 'mine' }, null)
    expect(state.row?.body).toBe('mine')
    expect(sync.getView()).toMatchObject({ state: 'saved', conflict: null })

    // Back to checked saves on the new version.
    sync.edit({ body: 'mine, edited' })
    await advance(DEBOUNCE_MS)
    expect(deps.save).toHaveBeenLastCalledWith('note-1', expect.anything(), state.row && stamp(3))
    expect(sync.getView().state).toBe('saved')
  })

  it('keeps overwriting if "Keep my version" fails the first time', async () => {
    const { sync, deps, state } = setup()
    state.changeAs(ROOMMATE, { body: 'theirs' })
    sync.edit({ body: 'mine' })
    await advance(DEBOUNCE_MS)
    state.failNext = 1
    sync.keepMine()
    await advance(0)
    expect(sync.getView().state).toBe('error')
    await advance(2_000)
    expect(deps.save.mock.calls.at(-1)?.[2]).toBeNull()
    expect(state.row?.body).toBe('mine')
    expect(sync.getView().state).toBe('saved')
  })

  it('"Load theirs" discards my edits and continues from their version', async () => {
    const { sync, deps, state } = setup()
    state.changeAs(ROOMMATE, { title: 'Their title', body: 'theirs' })
    sync.edit({ body: 'mine' })
    await advance(DEBOUNCE_MS)

    sync.loadTheirs()
    expect(sync.getView()).toMatchObject({ state: 'saved', conflict: null, draft: { title: 'Their title', body: 'theirs' } })
    expect(deps.onRow).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'theirs' }))
    await advance(DEBOUNCE_MS * 2)
    expect(deps.save).toHaveBeenCalledTimes(1) // nothing more to send

    sync.edit({ body: 'theirs plus mine' })
    await advance(DEBOUNCE_MS)
    expect(deps.save.mock.calls.at(-1)?.[2]).toBe(stamp(2))
    expect(state.row?.body).toBe('theirs plus mine')
  })

  it('does not call it a conflict when the roommate saved the same text', async () => {
    const { sync, state } = setup()
    state.changeAs(ROOMMATE, { body: 'same' })
    sync.edit({ body: 'same' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView()).toMatchObject({ state: 'saved', conflict: null })
  })

  it('carries on silently when only metadata changed (pin toggle bumps updated_at)', async () => {
    const { sync, deps, state } = setup()
    state.changeAs(ROOMMATE, { pinned: true })
    sync.edit({ body: 'my edit' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView()).toMatchObject({ state: 'saved', conflict: null })
    expect(deps.save).toHaveBeenCalledTimes(2)
    expect(deps.save.mock.calls[1][2]).toBe(stamp(2))
    expect(state.row).toMatchObject({ body: 'my edit', pinned: true })
  })

  it('writes over its own version if the check fails but nothing changed', async () => {
    const { sync, deps, state } = setup()
    // The server rejects the first guarded save even though the version matches.
    const original = deps.save.getMockImplementation()!
    deps.save.mockImplementationOnce(async () => null)
    sync.edit({ body: 'edit' })
    await advance(DEBOUNCE_MS)
    expect(deps.save.mock.calls.map((c) => c[2])).toEqual([stamp(1), null])
    expect(state.row?.body).toBe('edit')
    expect(sync.getView().state).toBe('saved')
    deps.save.mockImplementation(original)
  })

  it('reports a deleted note', async () => {
    const { sync, deps, state } = setup()
    state.delete()
    sync.edit({ body: 'too late' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView().gone).toBe(true)
    sync.edit({ body: 'ignored' })
    await advance(DEBOUNCE_MS * 2)
    expect(deps.save).toHaveBeenCalledTimes(1)
  })

  it('warns when closing with edits stuck behind a conflict', async () => {
    const { sync, deps, state } = setup()
    state.changeAs(ROOMMATE, { body: 'theirs' })
    sync.edit({ body: 'mine' })
    await advance(DEBOUNCE_MS)
    sync.dispose()
    expect(deps.onLostEdits).toHaveBeenCalledTimes(1)
  })
})

describe('changes from the server', () => {
  it('loads a roommate change silently when there are no unsaved edits', () => {
    const { sync, state } = setup()
    const theirs = state.changeAs(ROOMMATE, { body: '- milk\n- bread' })
    sync.observe(theirs)
    expect(sync.getView()).toMatchObject({ state: 'saved', draft: { body: '- milk\n- bread' }, conflict: null })
  })

  it('then saves on top of the loaded version', async () => {
    const { sync, deps, state } = setup()
    sync.observe(state.changeAs(ROOMMATE, { body: 'theirs' }))
    sync.edit({ body: 'theirs and mine' })
    await advance(DEBOUNCE_MS)
    expect(deps.save.mock.calls[0][2]).toBe(stamp(2))
    expect(sync.getView().state).toBe('saved')
  })

  it('leaves unsaved edits alone and lets the next save find the conflict', async () => {
    const { sync, state } = setup()
    sync.edit({ body: 'mine' })
    sync.observe(state.changeAs(ROOMMATE, { body: 'theirs' }))
    expect(sync.getView().draft.body).toBe('mine')
    expect(sync.getView().state).toBe('saving')
    await advance(DEBOUNCE_MS)
    expect(sync.getView().state).toBe('conflict')
  })

  it('ignores echoes of its own save and stale rows', async () => {
    const { sync, deps } = setup()
    const before = makeNote()
    sync.edit({ body: 'mine' })
    await advance(DEBOUNCE_MS)
    const saved = deps.onRow.mock.calls[0][0] as Note
    sync.observe(saved) // the refetch caused by our own save
    sync.observe(before) // a slow refetch that started before it
    expect(sync.getView()).toMatchObject({ state: 'saved', draft: { body: 'mine' } })
    sync.edit({ body: 'mine again' })
    await advance(DEBOUNCE_MS)
    expect(deps.save.mock.calls[1][2]).toBe(saved.updated_at)
    expect(sync.getView().state).toBe('saved')
  })

  it('follows a pin toggle without disturbing edits, then saves on the new version', async () => {
    const { sync, deps, state } = setup()
    sync.edit({ body: 'typing...' })
    sync.observe(state.changeAs(ME, { pinned: true }))
    expect(sync.getView().draft.body).toBe('typing...')
    await advance(DEBOUNCE_MS)
    expect(deps.save).toHaveBeenCalledTimes(1) // no false conflict, no wasted retry
    expect(deps.save.mock.calls[0][2]).toBe(stamp(2))
    expect(sync.getView().state).toBe('saved')
  })

  it('waits out a save in flight, then reconciles with what arrived meanwhile', async () => {
    const { sync, deps, state } = setup()
    let release: () => void = () => {}
    const original = deps.save.getMockImplementation()!
    deps.save.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => (release = resolve))
      return original(...args)
    })
    sync.edit({ body: 'mine' })
    await advance(DEBOUNCE_MS)
    // Pin lands on the server after our save, while the response is still on its way.
    release()
    await advance(0)
    sync.observe(state.changeAs(ROOMMATE, { pinned: true }))
    sync.edit({ body: 'mine, more' })
    await advance(DEBOUNCE_MS)
    expect(sync.getView().state).toBe('saved')
    expect(state.row).toMatchObject({ body: 'mine, more', pinned: true })
  })

  it('shows the newest version in the banner when the roommate keeps typing', async () => {
    const { sync, state } = setup()
    state.changeAs(ROOMMATE, { body: 'theirs 1' })
    sync.edit({ body: 'mine' })
    await advance(DEBOUNCE_MS)
    sync.observe(state.changeAs(ROOMMATE, { body: 'theirs 2' }))
    expect(sync.getView().conflict?.body).toBe('theirs 2')
    sync.loadTheirs()
    expect(sync.getView().draft.body).toBe('theirs 2')
  })

  it('ignores rows for other notes', () => {
    const { sync } = setup()
    sync.observe(makeNote({ id: 'other', body: 'other', updated_at: stamp(9) }))
    expect(sync.getView().draft.body).toBe('- milk')
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const { sync } = setup()
    const listener = vi.fn()
    const unsubscribe = sync.subscribe(listener)
    sync.edit({ body: 'a' })
    expect(listener).toHaveBeenCalled()
    listener.mockClear()
    unsubscribe()
    sync.edit({ body: 'b' })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('classifyRemote', () => {
  const base = stamp(1)
  const synced = { title: 'T', body: 'B' }
  const row = (patch: Partial<Note>) => makeNote({ title: 'T', body: 'B', updated_at: stamp(2), ...patch })
  const state = (patch = {}) => ({ base, synced, draft: synced, saving: false, conflict: null, ...patch })

  it('ignores anything not newer than our version', () => {
    expect(classifyRemote(state(), row({ updated_at: base }))).toBe('ignore')
    expect(classifyRemote(state(), row({ updated_at: stamp(0) }))).toBe('ignore')
  })

  it('rebases onto a newer version with the same text', () => {
    expect(classifyRemote(state({ draft: { title: 'T', body: 'edited' } }), row({}))).toBe('rebase')
  })

  it('loads changed text when nothing is unsaved', () => {
    expect(classifyRemote(state(), row({ body: 'new' }))).toBe('load')
  })

  it('defers changed text when there are unsaved edits or a save in flight', () => {
    expect(classifyRemote(state({ draft: { title: 'T', body: 'edited' } }), row({ body: 'new' }))).toBe('defer')
    expect(classifyRemote(state({ saving: true }), row({ body: 'new' }))).toBe('defer')
    expect(classifyRemote(state({ saving: true }), row({}))).toBe('defer')
  })

  it('only updates the banner while a conflict is showing', () => {
    const conflict = makeNote({ updated_at: stamp(3) })
    expect(classifyRemote(state({ conflict }), row({ updated_at: stamp(4) }))).toBe('update-conflict')
    expect(classifyRemote(state({ conflict }), row({ updated_at: stamp(3) }))).toBe('ignore')
    expect(classifyRemote(state({ conflict }), row({ updated_at: stamp(2) }))).toBe('ignore')
  })
})

describe('conflictMessage', () => {
  const nameOf = (id: string | null) => (id === ROOMMATE ? 'Sam' : null)

  it('names the roommate', () => {
    expect(conflictMessage({ updated_by: ROOMMATE }, ME, nameOf)).toBe('Sam changed this note while you were editing.')
  })

  it('has a fallback when the name is unknown', () => {
    expect(conflictMessage({ updated_by: null }, ME, nameOf)).toBe('Your roommate changed this note while you were editing.')
  })

  it('says so when it was you, somewhere else', () => {
    expect(conflictMessage({ updated_by: ME }, ME, nameOf)).toBe('This note changed on another device while you were editing.')
  })
})
