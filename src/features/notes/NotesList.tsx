import { Pin, StickyNote } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/Field'
import { EmptyState, Panel, SectionLabel } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import type { Note } from './api'
import { useMembers } from '../../household/useHousehold'
import { EditedBy, type People } from './EditedBy'
import { useNotes } from './hooks'
import { filterNotes, noteSnippetFor, noteTitle } from './noteText'

/** Re-render once a minute so "3 minutes ago" stays honest. */
function useMinuteTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [])
}

function NoteRow({ note, active, people }: { note: Note; active: boolean; people: People }) {
  const snippet = noteSnippetFor(note)
  return (
    <li>
      <Link
        to={`/notes/${note.id}`}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-16 flex-col gap-0.5 px-4 py-3 transition-colors focus-visible:-outline-offset-2 ${active ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
      >
        <span className="flex items-center gap-2">
          {note.pinned && <Pin aria-hidden className="size-4 shrink-0 fill-current text-accent" />}
          <span className="truncate font-semibold">{noteTitle(note)}</span>
        </span>
        <span className="line-clamp-2 text-sm break-words text-muted">{snippet || 'No text yet'}</span>
        <span className="text-xs text-muted">
          <EditedBy note={note} people={people} />
        </span>
      </Link>
    </li>
  )
}

function NoteGroup({ label, notes, activeId, people }: { label?: string; notes: Note[]; activeId?: string; people: People }) {
  if (notes.length === 0) return null
  return (
    <section className="flex shrink-0 flex-col gap-2">
      {label && <SectionLabel>{label}</SectionLabel>}
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {notes.map((note) => (
            <NoteRow key={note.id} note={note} active={note.id === activeId} people={people} />
          ))}
        </ul>
      </Panel>
    </section>
  )
}

export function NotesList({
  activeId,
  onCreate,
  creating,
}: {
  activeId?: string
  onCreate: () => void
  creating: boolean
}) {
  const { data, isPending, isError, error, refetch } = useNotes()
  const { me, byId } = useMembers()
  const people = { me, byId }
  const [query, setQuery] = useState('')
  useMinuteTick()

  const visible = useMemo(() => filterNotes(data ?? [], query), [data, query])
  const pinned = visible.filter((n) => n.pinned)
  const others = visible.filter((n) => !n.pinned)

  if (isPending) return <LoadingBlock label="Loading notes" />
  if (isError) return <ErrorBlock error={error} onRetry={() => void refetch()} />

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<StickyNote aria-hidden />}
        title="No notes yet"
        action={
          <Button variant="primary" loading={creating} onClick={onCreate}>
            New note
          </Button>
        }
      >
        Start a note for a grocery list or house rules. Both of you can edit it.
      </EmptyState>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <TextField
        label="Search notes"
        hideLabel
        type="search"
        placeholder="Search notes"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:overflow-y-auto lg:pr-1">
        {visible.length === 0 ? (
          <EmptyState title="No matching notes">
            No note has “{query.trim()}” in its title or text.
          </EmptyState>
        ) : (
          <>
            <NoteGroup label="Pinned" notes={pinned} activeId={activeId} people={people} />
            <NoteGroup label={pinned.length > 0 ? 'Other notes' : undefined} notes={others} activeId={activeId} people={people} />
          </>
        )}
      </div>
    </div>
  )
}
