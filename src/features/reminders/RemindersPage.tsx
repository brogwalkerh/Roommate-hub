import { ChevronDown, ListChecks, Plus } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { EmptyState, PageHeader, Panel, Segmented } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { useMembers } from '../../household/useHousehold'
import {
  RECENT_DAYS,
  useCompleteReminder,
  useOpenReminders,
  useRecentlyDoneReminders,
  useUndoCompleteReminder,
} from './hooks'
import {
  filterReminders,
  groupReminders,
  matchesFilter,
  type DoneItem,
  type Reminder,
  type ReminderFilter,
} from './logic'
import { QuickAdd } from './QuickAdd'
import { ReminderDialog } from './ReminderDialog'
import { DoneRow, ReminderRow } from './ReminderRow'
import { useNow } from './useNow'

type Editor = { open: boolean; reminder: Reminder | null; nonce: number }

const HEADING = 'text-xs font-semibold tracking-[0.08em] uppercase'

export default function RemindersPage() {
  const now = useNow()
  const { me, roommate, byId } = useMembers()
  const open = useOpenReminders()
  const done = useRecentlyDoneReminders()
  const complete = useCompleteReminder()
  const undo = useUndoCompleteReminder()

  const [filter, setFilter] = useState<ReminderFilter>('all')
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [editor, setEditor] = useState<Editor>({ open: false, reminder: null, nonce: 0 })

  const meId = me?.id ?? null
  const roommateId = roommate?.id ?? null
  const people = useMemo(() => ({ meId, roommateId }), [meId, roommateId])

  const allOpen = open.data
  const visibleOpen = useMemo(() => filterReminders(allOpen ?? [], filter, people), [allOpen, filter, people])
  const groups = useMemo(() => groupReminders(visibleOpen, now), [visibleOpen, now])
  const allDone = done.data
  const visibleDone = useMemo(
    () => (allDone ?? []).filter((item) => matchesFilter(item.assigneeId, filter, people)),
    [allDone, filter, people],
  )

  const openEditor = (reminder: Reminder | null) =>
    setEditor((e) => ({ open: true, reminder, nonce: e.nonce + 1 }))
  const closeEditor = () => setEditor((e) => ({ ...e, open: false }))

  // If a new or edited reminder wouldn't show under the current filter, show everything.
  const handleSaved = (assigneeId: string | null) => {
    if (!matchesFilter(assigneeId, filter, people)) setFilter('all')
  }

  const hasOpen = (allOpen?.length ?? 0) > 0
  const hasDone = (allDone?.length ?? 0) > 0
  const firstRun = open.isSuccess && !hasOpen && done.isSuccess && !hasDone
  const showNotificationHint = typeof Notification !== 'undefined' && Notification.permission !== 'granted'

  const filterOptions = [
    { value: 'all' as const, label: 'All' },
    { value: 'mine' as const, label: 'Mine' },
    ...(roommate
      ? [{ value: 'roommate' as const, label: <span className="block max-w-32 truncate">{roommate.display_name}</span> }]
      : []),
  ]

  const renderRows = (reminders: Reminder[], overdue: boolean) =>
    reminders.map((reminder) => (
      <ReminderRow
        key={reminder.id}
        reminder={reminder}
        assignee={byId(reminder.assignee_id)}
        overdue={overdue}
        onComplete={(id) => complete.mutate(id)}
        onOpen={openEditor}
      />
    ))

  let body: ReactNode
  if (open.isLoading) {
    body = <LoadingBlock label="Loading reminders" />
  } else if (open.isError) {
    body = <ErrorBlock error={open.error} onRetry={() => void open.refetch()} />
  } else if (firstRun) {
    body = (
      <EmptyState
        icon={<ListChecks aria-hidden />}
        title="Nothing to remember yet"
        action={
          <Button variant="primary" onClick={() => openEditor(null)}>
            Add your first reminder
          </Button>
        }
      >
        Add the things you keep forgetting, like “Take out the trash, every Tuesday”.
      </EmptyState>
    )
  } else if (!hasOpen) {
    body = (
      <EmptyState icon={<ListChecks aria-hidden />} title="You’re all caught up">
        Nothing is due. Type a reminder above when something comes up.
      </EmptyState>
    )
  } else if (visibleOpen.length === 0) {
    body = (
      <EmptyState
        icon={<ListChecks aria-hidden />}
        title={filter === 'mine' ? 'Nothing for you' : `Nothing for ${roommate?.display_name ?? 'your roommate'}`}
      >
        Switch to All to see every reminder.
      </EmptyState>
    )
  } else {
    body = (
      <>
        <ReminderSection label="Overdue" tone="danger">
          {renderRows(groups.overdue, true)}
        </ReminderSection>
        <ReminderSection label="Today">{renderRows(groups.today, false)}</ReminderSection>
        <ReminderSection label="Upcoming">{renderRows(groups.upcoming, false)}</ReminderSection>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reminders"
        actions={
          <Button variant="primary" icon={<Plus aria-hidden className="size-5" />} onClick={() => openEditor(null)}>
            Add reminder
          </Button>
        }
      />

      <QuickAdd onAdded={(reminder) => handleSaved(reminder.assignee_id)} />

      {roommate && (
        <div className="max-w-full">
          <Segmented label="Show reminders for" value={filter} options={filterOptions} onChange={setFilter} />
        </div>
      )}

      {body}

      {open.isSuccess && !firstRun && (
        <DoneSection
          expanded={doneExpanded}
          onToggle={() => setDoneExpanded((v) => !v)}
          loading={done.isLoading}
          error={done.isError ? done.error : null}
          onRetry={() => void done.refetch()}
          items={visibleDone}
          renderRow={(item) => (
            <DoneRow
              key={item.key}
              item={item}
              completedBy={byId(item.completedBy)}
              onUndo={(id) => undo.mutate(id)}
            />
          )}
        />
      )}

      {showNotificationHint && (
        <p className="text-sm text-muted">
          Get a notification when something’s due:{' '}
          <Link to="/settings" className="font-medium text-accent underline underline-offset-2">
            turn on notifications in Settings
          </Link>
        </p>
      )}

      <ReminderDialog
        key={editor.nonce}
        open={editor.open}
        reminder={editor.reminder}
        onClose={closeEditor}
        onSaved={handleSaved}
      />
    </div>
  )
}

/** A titled group of reminder rows. Renders nothing when it has no rows. */
function ReminderSection({ label, tone = 'muted', children }: { label: string; tone?: 'muted' | 'danger'; children: ReactNode[] }) {
  const headingId = useId()
  if (children.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className={`${HEADING} ${tone === 'danger' ? 'text-danger' : 'text-muted'}`}>
        {label}
      </h2>
      <Panel>
        <ul className="divide-y divide-line">{children}</ul>
      </Panel>
    </section>
  )
}

function DoneSection({
  expanded,
  onToggle,
  loading,
  error,
  onRetry,
  items,
  renderRow,
}: {
  expanded: boolean
  onToggle: () => void
  loading: boolean
  error: unknown
  onRetry: () => void
  items: DoneItem[]
  renderRow: (item: DoneItem) => ReactNode
}) {
  const headingId = useId()
  const listId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className={`${HEADING} text-muted`}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={onToggle}
          className="-mx-2 flex min-h-10 items-center gap-1.5 rounded-lg px-2 hover:bg-surface-2"
        >
          Done in the last {RECENT_DAYS} days{items.length > 0 ? ` (${items.length})` : ''}
          <ChevronDown aria-hidden className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </h2>
      <div id={listId} hidden={!expanded}>
        {loading ? (
          <LoadingBlock label="Loading" />
        ) : error ? (
          <ErrorBlock error={error} onRetry={onRetry} />
        ) : items.length === 0 ? (
          <p className="px-1 text-sm text-muted">Nothing finished in the last {RECENT_DAYS} days.</p>
        ) : (
          <Panel>
            <ul className="divide-y divide-line">{items.map(renderRow)}</ul>
          </Panel>
        )}
      </div>
    </section>
  )
}
