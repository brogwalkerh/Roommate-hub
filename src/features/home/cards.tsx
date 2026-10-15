import { addDays, startOfDay } from 'date-fns'
import { CalendarDays, Check, FolderOpen, Home, ListChecks, NotebookPen, Pin } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { PersonDot } from '../../components/Person'
import { useMembers } from '../../household/useHousehold'
import { formatDayTime, formatTime } from '../../lib/dates'
import { fileKind, formatUploaded } from '../files/fileUtils'
import { FileIcon } from '../files/FileIcon'
import { useRecentFiles } from '../files/hooks'
import { usePinnedNotes } from '../notes/hooks'
import { noteSnippetFor, noteTitle } from '../notes/noteText'
import { useCompleteReminder, useDueSoonReminders } from '../reminders/hooks'
import { useCalendarFeeds, useCalendarItems, useGuestStays } from '../schedule/hooks'
import { Card, CardNote } from './Card'
import { stayStatus } from './summary'

function Skeleton() {
  return <div aria-hidden className="h-12 animate-pulse rounded-lg bg-surface-2" />
}

export function TodayCard({ now }: { now: Date }) {
  const range = useMemo(() => {
    const start = startOfDay(now)
    return { start, end: addDays(start, 1) }
  }, [now])
  const { items, isLoading } = useCalendarItems(range)
  const today = items.filter((i) => i.kind !== 'blocked' && i.kind !== 'stay')

  return (
    <Card icon={CalendarDays} title="Today" to="/schedule" linkLabel="Schedule">
      {isLoading ? (
        <Skeleton />
      ) : today.length === 0 ? (
        <CardNote>Nothing on the calendar today.</CardNote>
      ) : (
        <ul className="flex flex-col gap-2">
          {today.slice(0, 6).map((item) => (
            <li key={`${item.source}:${item.id}`} className="flex items-center gap-3">
              <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.title}</span>
                <span className="text-sm text-muted tabular">
                  {item.allDay ? 'All day' : `${formatTime(item.start)} – ${formatTime(item.end)}`}
                </span>
              </span>
            </li>
          ))}
          {today.length > 6 && <CardNote>+{today.length - 6} more</CardNote>}
        </ul>
      )}
    </Card>
  )
}

export function GuestsCard({ now }: { now: Date }) {
  const range = useMemo(() => {
    const start = addDays(startOfDay(now), -30)
    return { start, end: addDays(startOfDay(now), 60) }
  }, [now])
  const { stays, isLoading } = useGuestStays(range)
  const feeds = useCalendarFeeds()
  const hasAirbnb = (feeds.data ?? []).some((f) => f.kind === 'airbnb')
  const status = stayStatus(stays, now)

  if (feeds.isLoading || isLoading) {
    return (
      <Card icon={Home} title="Guests" to="/schedule">
        <Skeleton />
      </Card>
    )
  }
  if (!hasAirbnb) {
    return (
      <Card icon={Home} title="Guests" to="/settings" linkLabel="Connect">
        <CardNote>Connect your Airbnb calendar in Settings to see check-ins and check-outs here.</CardNote>
      </Card>
    )
  }
  return (
    <Card icon={Home} title="Guests" to="/schedule" tone={status?.active ? 'guest' : 'default'}>
      {status ? (
        <div>
          <p className="font-display text-xl font-bold">{status.headline}</p>
          <p className="text-sm text-muted">{status.detail}</p>
        </div>
      ) : (
        <CardNote>No guests booked in the next two months.</CardNote>
      )}
    </Card>
  )
}

export function RemindersCard({ now }: { now: Date }) {
  const { reminders, isLoading } = useDueSoonReminders(24)
  const complete = useCompleteReminder()
  const { byId } = useMembers()

  return (
    <Card icon={ListChecks} title="Due soon" to="/reminders" linkLabel="Reminders">
      {isLoading ? (
        <Skeleton />
      ) : reminders.length === 0 ? (
        <CardNote>Nothing due in the next 24 hours.</CardNote>
      ) : (
        <ul className="flex flex-col gap-1">
          {reminders.slice(0, 5).map((r) => {
            const overdue = new Date(r.due_at) < now
            return (
              <li key={r.id} className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={`Mark “${r.title}” done`}
                  onClick={() => complete.mutate(r.id)}
                  className="group flex size-10 shrink-0 items-center justify-center rounded-full"
                >
                  <span className="flex size-6 items-center justify-center rounded-full border-2 border-line group-hover:border-accent">
                    <Check className="size-3.5 opacity-0 group-hover:opacity-60" aria-hidden />
                  </span>
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className={`flex items-center gap-1.5 text-sm ${overdue ? 'text-danger' : 'text-muted'}`}>
                    <PersonDot person={byId(r.assignee_id)} className="size-2" />
                    {overdue ? 'Overdue · ' : ''}
                    {formatDayTime(new Date(r.due_at))}
                  </span>
                </span>
              </li>
            )
          })}
          {reminders.length > 5 && <CardNote>+{reminders.length - 5} more</CardNote>}
        </ul>
      )}
    </Card>
  )
}

export function NotesCard() {
  const { data, isLoading } = usePinnedNotes()
  const pinned = data ?? []
  return (
    <Card icon={NotebookPen} title="Pinned notes" to="/notes" linkLabel="Notes">
      {isLoading ? (
        <Skeleton />
      ) : pinned.length === 0 ? (
        <CardNote>Pin a note, like the grocery list, to keep it here.</CardNote>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {pinned.slice(0, 4).map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="flex items-start gap-2 py-2 hover:text-accent">
                <Pin className="mt-1 size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{noteTitle(n)}</span>
                  <span className="line-clamp-1 text-sm text-muted">{noteSnippetFor(n, 80)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function FilesCard() {
  const { data, isLoading } = useRecentFiles(4)
  const files = data ?? []
  return (
    <Card icon={FolderOpen} title="Recent files" to="/files" linkLabel="Files">
      {isLoading ? (
        <Skeleton />
      ) : files.length === 0 ? (
        <CardNote>Keep the lease, the Wi-Fi card and manuals here.</CardNote>
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3">
              <FileIcon kind={fileKind(f.mime_type, f.name)} className="size-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-sm text-muted">{formatUploaded(f.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
