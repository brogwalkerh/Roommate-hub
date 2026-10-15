import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pin, PinOff, Trash2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { Button, IconButton } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState, Panel, Segmented } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { friendlyError } from '../../lib/errors'
import type { Note } from './api'
import { EditedBy } from './EditedBy'
import { forgetNote, isNoteId, useDeleteNote, useNote, useTogglePin } from './hooks'
import { conflictMessage, type SyncState } from './noteSync'
import { noteTitle } from './noteText'
import { toggleTaskInMarkdown } from './taskList'
import { useNoteEditor } from './useNoteEditor'

// The Markdown renderer is the heaviest part of this page; load it on first Preview.
const MarkdownPreview = lazy(() => import('./MarkdownPreview'))

type Mode = 'write' | 'preview'

const STATUS: Record<SyncState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Not saved, retrying',
  conflict: 'Not saved',
}

/** Grow a textarea to fit its text, so the page (not the box) scrolls. */
function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!active || !el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    // Text re-wraps when the window or phone orientation changes.
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [ref, value, active])
}

export function NoteGone() {
  const navigate = useNavigate()
  return (
    <EmptyState title="This note is gone">
      It was deleted, or the link is wrong.
      <div className="mt-4 flex justify-center">
        <Button variant="primary" onClick={() => navigate('/notes', { replace: true })}>
          Back to notes
        </Button>
      </div>
    </EmptyState>
  )
}

/** Loads the note for a route, then hands it to the editor. */
export function NoteEditor({ noteId }: { noteId: string }) {
  const { data, error, refetch } = useNote(noteId)

  if (!isNoteId(noteId) || data === null) return <NoteGone />
  // Show the error only if there is nothing to edit: a failed background refetch must not tear down the editor.
  if (data === undefined) return error ? <ErrorBlock error={error} onRetry={() => void refetch()} /> : <LoadingBlock label="Opening note" />
  return <NoteEditorBody key={data.id} note={data} />
}

function NoteEditorBody({ note }: { note: Note }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { me, byId } = useMembers()
  const editor = useNoteEditor(note)
  const togglePin = useTogglePin()
  const deleteNote = useDeleteNote()

  const [mode, setMode] = useState<Mode>('write')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removed, setRemoved] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useAutoGrow(bodyRef, editor.draft.body, mode === 'write')

  // A brand-new note opens ready to type.
  const [startedEmpty] = useState(() => !note.title && !note.body)
  useEffect(() => {
    if (startedEmpty) titleRef.current?.focus()
  }, [startedEmpty])

  async function onTogglePin() {
    try {
      await togglePin.mutateAsync({ id: note.id, pinned: !note.pinned })
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    }
  }

  async function onDelete() {
    try {
      await deleteNote.mutateAsync(note.id)
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
      return
    }
    editor.abandon()
    setRemoved(true)
    setConfirmDelete(false)
    navigate('/notes', { replace: true })
    forgetNote(queryClient, note.id)
  }

  if (removed) return null
  if (editor.gone) return <NoteGone />

  const unsaved = editor.state === 'error' || editor.state === 'conflict'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-bg px-4 py-2 lg:static lg:mx-0 lg:p-0">
        <IconButton label="Back to notes" className="lg:hidden" onClick={() => navigate('/notes')}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <Segmented
          label="Note view"
          value={mode}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
          onChange={(next) => {
            editor.flush()
            setMode(next)
          }}
        />
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={note.pinned ? 'Unpin note' : 'Pin note'}
            aria-pressed={note.pinned}
            disabled={togglePin.isPending}
            onClick={() => void onTogglePin()}
          >
            {note.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
          </IconButton>
          <IconButton label="Delete note" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-5" />
          </IconButton>
        </div>
      </div>

      {editor.conflict && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-warn">
          <p className="font-medium">{conflictMessage(editor.conflict, me?.id, (id) => byId(id)?.display_name)}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={editor.keepMine}>
              Keep my version
            </Button>
            <Button onClick={editor.loadTheirs}>Load theirs</Button>
          </div>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span role="status" className={unsaved ? 'font-medium text-warn' : undefined}>
          {STATUS[editor.state]}
        </span>
        <EditedBy note={editor.conflict ?? note} people={{ me, byId }} />
      </p>

      <Panel className="flex flex-col focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <input
          ref={titleRef}
          aria-label="Title"
          placeholder="Title"
          maxLength={200}
          value={editor.draft.title}
          onChange={(e) => editor.setTitle(e.target.value)}
          onBlur={editor.flush}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              setMode('write')
              bodyRef.current?.focus()
            }
          }}
          className="h-14 w-full shrink-0 border-b border-line bg-transparent px-4 font-display text-xl font-bold text-ink placeholder:text-muted/70 focus:outline-none"
        />
        {mode === 'write' ? (
          <textarea
            ref={bodyRef}
            aria-label="Note text"
            placeholder="Write something. Start a line with - [ ] to make a checklist."
            maxLength={100_000}
            spellCheck
            value={editor.draft.body}
            onChange={(e) => editor.setBody(e.target.value)}
            onBlur={editor.flush}
            className="block min-h-72 w-full shrink-0 resize-none bg-transparent px-4 py-3 font-mono leading-relaxed text-ink placeholder:text-muted/70 focus:outline-none"
          />
        ) : (
          <div className="min-h-72 shrink-0 px-4 py-3">
            <Suspense fallback={<LoadingBlock label="Loading preview" />}>
              <MarkdownPreview
                source={editor.draft.body}
                onToggleTask={(index) => editor.setBody(toggleTaskInMarkdown(editor.draft.body, index), { immediate: true })}
              />
            </Suspense>
          </div>
        )}
      </Panel>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this note?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" loading={deleteNote.isPending} onClick={() => void onDelete()}>
              Delete note
            </Button>
          </>
        }
      >
        <p>
          “{noteTitle(editor.draft)}” will be deleted for both of you. This can’t be undone.
        </p>
      </Dialog>
    </div>
  )
}
