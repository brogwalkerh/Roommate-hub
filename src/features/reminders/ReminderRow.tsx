import { Check, CircleCheck, Repeat } from 'lucide-react'
import { PersonChip } from '../../components/Person'
import { Button } from '../../components/ui/Button'
import { formatDayTime } from '../../lib/dates'
import type { Profile } from '../../household/useHousehold'
import { repeatLabel, type DoneItem, type Reminder } from './logic'

/**
 * Round checkbox with a 44px tap area. The real <input> covers the whole area
 * (invisible) so taps, Space and screen readers all work as for any checkbox.
 */
function RoundCheckbox({ label, onChange }: { label: string; onChange: () => void }) {
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        aria-label={label}
        checked={false}
        onChange={onChange}
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className="pointer-events-none flex size-6 items-center justify-center rounded-full border-2 border-muted text-transparent transition-colors peer-hover:border-accent peer-hover:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </span>
  )
}

type ReminderRowProps = {
  reminder: Reminder
  /** The assigned person; null together with a null assignee_id means both. */
  assignee: Profile | null
  overdue: boolean
  onComplete: (id: string) => void
  onOpen: (reminder: Reminder) => void
}

/** One open reminder: tick the circle to finish it, tap the rest to edit it. */
export function ReminderRow({ reminder, assignee, overdue, onComplete, onOpen }: ReminderRowProps) {
  const repeat = repeatLabel(reminder.repeat)
  // Wait for the profile to load rather than showing "Both" for a named person.
  const showAssignee = reminder.assignee_id === null || assignee !== null

  return (
    <li className="flex items-center gap-1 pr-2 pl-1">
      <RoundCheckbox label={reminder.title} onChange={() => onComplete(reminder.id)} />
      <button
        type="button"
        onClick={() => onOpen(reminder)}
        className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-1 rounded-lg py-2 pr-2 pl-1 text-left transition-colors hover:bg-surface-2"
      >
        <span className="line-clamp-2 font-medium break-words">{reminder.title}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className={overdue ? 'font-medium text-danger' : 'text-muted'}>
            {overdue && <span className="sr-only">Overdue: </span>}
            {formatDayTime(new Date(reminder.due_at))}
          </span>
          {repeat && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              <Repeat aria-hidden className="size-3" />
              {repeat}
            </span>
          )}
          {showAssignee && <PersonChip person={assignee} bothLabel="Both" />}
        </span>
      </button>
    </li>
  )
}

type DoneRowProps = {
  item: DoneItem
  /** Who finished it, when known. */
  completedBy: Profile | null
  onUndo: (reminderId: string) => void
}

/** One finished reminder, with Undo for the latest completion. */
export function DoneRow({ item, completedBy, onUndo }: DoneRowProps) {
  return (
    <li className="flex items-center gap-1 pr-2 pl-1">
      <span className="flex size-11 shrink-0 items-center justify-center text-accent">
        <CircleCheck aria-hidden className="size-6" />
      </span>
      <div className="min-w-0 flex-1 py-2 pr-2">
        <p className="line-clamp-2 font-medium break-words text-muted">{item.title}</p>
        <p className="text-sm text-muted">
          Done {formatDayTime(new Date(item.completedAt))}
          {completedBy ? ` · ${completedBy.display_name}` : ''}
        </p>
      </div>
      {item.canUndo && (
        <Button variant="ghost" aria-label={`Undo ${item.title}`} onClick={() => onUndo(item.reminderId)}>
          Undo
        </Button>
      )}
    </li>
  )
}
