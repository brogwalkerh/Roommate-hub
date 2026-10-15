// Pure reminder logic: grouping, filtering, labels and defaults.
// Nothing here touches React or Supabase, so it is easy to test.

import { addDays, addHours, setHours, startOfDay, startOfHour } from 'date-fns'
import type { Enums, Tables } from '../../lib/database.types'
import { friendlyError } from '../../lib/errors'

export type Reminder = Tables<'reminders'>
export type RepeatRule = Enums<'repeat_rule'>

const time = (iso: string) => Date.parse(iso)

/** Soonest first. */
function byDue(a: { due_at: string }, b: { due_at: string }) {
  return time(a.due_at) - time(b.due_at)
}

/** A reminder is overdue once its due time has passed. */
export function isOverdue(reminder: { due_at: string }, now: Date): boolean {
  return time(reminder.due_at) < now.getTime()
}

export type ReminderGroups<T> = { overdue: T[]; today: T[]; upcoming: T[] }

/**
 * Split open reminders into Overdue (due time already passed), Today (later
 * today) and Upcoming (tomorrow or later), using the viewer's local midnight.
 * Each group is sorted soonest first.
 */
export function groupReminders<T extends { due_at: string }>(reminders: T[], now: Date): ReminderGroups<T> {
  const nowMs = now.getTime()
  const tomorrowMs = startOfDay(addDays(now, 1)).getTime()
  const groups: ReminderGroups<T> = { overdue: [], today: [], upcoming: [] }
  for (const reminder of [...reminders].sort(byDue)) {
    const due = time(reminder.due_at)
    if (due < nowMs) groups.overdue.push(reminder)
    else if (due < tomorrowMs) groups.today.push(reminder)
    else groups.upcoming.push(reminder)
  }
  return groups
}

/** Overdue reminders plus those due within the next `hours`, soonest first. */
export function dueSoon<T extends { due_at: string }>(reminders: T[], now: Date, hours: number): T[] {
  const limit = now.getTime() + hours * 60 * 60 * 1000
  return reminders.filter((r) => time(r.due_at) <= limit).sort(byDue)
}

/** "" for one-time reminders, otherwise "Every day", "Every 2 weeks" and so on. */
export function repeatLabel(repeat: RepeatRule): string {
  switch (repeat) {
    case 'daily':
      return 'Every day'
    case 'weekly':
      return 'Every week'
    case 'biweekly':
      return 'Every 2 weeks'
    case 'monthly':
      return 'Every month'
    default:
      return ''
  }
}

export const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: 'none', label: 'Doesn’t repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
]

/**
 * The due time a new reminder starts with: the next full hour, or 9:00 AM
 * tomorrow once it is 9 PM or later.
 */
export function defaultDueAt(now: Date): Date {
  if (now.getHours() >= 21) return setHours(startOfDay(addDays(now, 1)), 9)
  return startOfHour(addHours(now, 1))
}

export type ReminderFilter = 'all' | 'mine' | 'roommate'

export type FilterPeople = { meId: string | null; roommateId: string | null }

/**
 * "Mine" includes reminders for both of you (no assignee); the roommate's
 * filter shows only what is assigned to them.
 */
export function matchesFilter(assigneeId: string | null, filter: ReminderFilter, people: FilterPeople): boolean {
  switch (filter) {
    case 'mine':
      return assigneeId === null || assigneeId === people.meId
    case 'roommate':
      return assigneeId !== null && assigneeId === people.roommateId
    default:
      return true
  }
}

export function filterReminders<T extends { assignee_id: string | null }>(
  reminders: T[],
  filter: ReminderFilter,
  people: FilterPeople,
): T[] {
  return filter === 'all' ? reminders : reminders.filter((r) => matchesFilter(r.assignee_id, filter, people))
}

/** One finished reminder (or one finished occurrence of a repeating one). */
export type DoneItem = {
  key: string
  reminderId: string
  title: string
  assigneeId: string | null
  repeat: RepeatRule
  completedAt: string
  completedBy: string | null
  /** Only the latest completion of a reminder can be undone. */
  canUndo: boolean
}

type DoneReminder = Pick<Reminder, 'id' | 'title' | 'assignee_id' | 'repeat' | 'completed_at' | 'completed_by'>

export type CompletionRow = {
  id: string
  reminder_id: string
  completed_at: string
  completed_by: string | null
  reminders: Pick<Reminder, 'title' | 'assignee_id' | 'repeat'> | null
}

/**
 * Merge finished one-time reminders with the completion log of repeating ones
 * into one list, newest first.
 *
 * complete_reminder logs a completion for every reminder, including one-time
 * ones, and stamps both rows with the same transaction time. A completion that
 * matches its reminder's own completed_at is therefore the same event, and is
 * listed once.
 */
export function buildDoneItems(finished: DoneReminder[], completions: CompletionRow[]): DoneItem[] {
  const items: Omit<DoneItem, 'canUndo'>[] = []
  const finishedAt = new Map<string, number>()

  for (const r of finished) {
    if (!r.completed_at) continue
    finishedAt.set(r.id, time(r.completed_at))
    items.push({
      key: `reminder:${r.id}`,
      reminderId: r.id,
      title: r.title,
      assigneeId: r.assignee_id,
      repeat: r.repeat,
      completedAt: r.completed_at,
      completedBy: r.completed_by,
    })
  }

  for (const c of completions) {
    if (!c.reminders) continue
    if (finishedAt.get(c.reminder_id) === time(c.completed_at)) continue
    items.push({
      key: `completion:${c.id}`,
      reminderId: c.reminder_id,
      title: c.reminders.title,
      assigneeId: c.reminders.assignee_id,
      repeat: c.reminders.repeat,
      completedAt: c.completed_at,
      completedBy: c.completed_by,
    })
  }

  items.sort((a, b) => time(b.completedAt) - time(a.completedAt))
  const seen = new Set<string>()
  return items.map((item) => {
    const canUndo = !seen.has(item.reminderId)
    seen.add(item.reminderId)
    return { ...item, canUndo }
  })
}

/** Error text for reminder actions; falls back to the app-wide wording. */
export function reminderError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
  const message =
    typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : ''
  if (/reminder_not_found/.test(message) || code === 'PGRST116') {
    return 'That reminder is gone. Your roommate may have deleted it.'
  }
  if (/nothing_to_undo/.test(message)) return 'There’s nothing left to undo for that reminder.'
  return friendlyError(error)
}
