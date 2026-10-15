import { NotebookPen, Plus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { EmptyState, PageHeader } from '../../components/ui/Layout'
import { useToast } from '../../components/ui/Toast'
import { friendlyError } from '../../lib/errors'
import { useCreateNote } from './hooks'
import { NoteEditor } from './NoteEditor'
import { NotesList } from './NotesList'

/**
 * Notes. Two panes on large screens (list left, editor right). On phones and
 * small tablets one pane at a time: the list at #/notes, the editor at
 * #/notes/:noteId with a back button.
 *
 * The side-by-side layout starts at `lg`, not `md`: from `md` up the app shows
 * a 15rem sidebar, so at 768px only ~29rem is left for this page, which would
 * leave the editor about 9rem next to a 20rem list.
 */
export default function NotesPage() {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const create = useCreateNote()

  async function newNote() {
    try {
      const id = await create.mutateAsync()
      navigate(`/notes/${id}`)
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-5rem)] lg:min-h-[28rem]">
      {/* On a phone the open note has its own toolbar, so the page title steps aside. */}
      <div className={noteId ? 'hidden lg:block' : undefined}>
        <PageHeader
          title="Notes"
          actions={
            <Button variant="primary" icon={<Plus className="size-5" aria-hidden />} loading={create.isPending} onClick={() => void newNote()}>
              New note
            </Button>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-6">
        <div className={`min-h-0 flex-col ${noteId ? 'hidden lg:flex' : 'flex'}`}>
          <NotesList activeId={noteId} onCreate={() => void newNote()} creating={create.isPending} />
        </div>
        <div className={`min-h-0 flex-col ${noteId ? 'flex' : 'hidden lg:flex'}`}>
          {noteId ? (
            <NoteEditor key={noteId} noteId={noteId} />
          ) : (
            <EmptyState icon={<NotebookPen aria-hidden />} title="Pick a note">
              Choose a note from the list to read or edit it, or start a new one.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  )
}
