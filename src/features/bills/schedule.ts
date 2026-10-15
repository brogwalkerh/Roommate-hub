// Date math for bills. Bill dates are date-only strings ("2026-10-15") in the
// household's time zone, so "today" is computed in that zone too and dates are
// compared as strings (yyyy-MM-dd sorts chronologically).

import { addDays, addMonths, differenceInCalendarDays, format, getDaysInMonth, startOfMonth } from 'date-fns'
import { parseDateOnly, toDateInput } from '../../lib/dates'

/** Today's date ("2026-10-15") in `timeZone`, or in the browser's zone when none or invalid. */
export function todayIn(timeZone?: string | null, now: Date = new Date()): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now)
      const get = (type: string) => parts.find((p) => p.type === type)?.value
      const year = get('year')
      const month = get('month')
      const day = get('day')
      if (year && month && day) return `${year}-${month}-${day}`
    } catch {
      // Unknown time zone name: fall back to the browser's.
    }
  }
  return toDateInput(now)
}

/** "2026-10-15" + 7 -> "2026-10-22". */
export function addDaysTo(date: string, days: number): string {
  return toDateInput(addDays(parseDateOnly(date), days))
}

export function isOverdue(dueOn: string | null, today: string): boolean {
  return dueOn !== null && dueOn < today
}

/** Due on or before `today + days`. Overdue bills count. Bills with no due date don't. */
export function isDueWithin(dueOn: string | null, today: string, days: number): boolean {
  return dueOn !== null && dueOn <= addDaysTo(today, days)
}

type DueSortable = { due_on: string | null; created_at: string; title: string }

/** Soonest due first, bills with no due date last; ties by when they were added. */
export function compareByDue(a: DueSortable, b: DueSortable): number {
  if (a.due_on !== b.due_on) {
    if (a.due_on === null) return 1
    if (b.due_on === null) return -1
    return a.due_on < b.due_on ? -1 : 1
  }
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
  return a.title.localeCompare(b.title)
}

/** "Fri, Oct 17", with the year when it isn't this year. */
export function formatBillDate(date: string, today: string): string {
  const d = parseDateOnly(date)
  return format(d, date.slice(0, 4) === today.slice(0, 4) ? 'EEE, MMM d' : 'EEE, MMM d, yyyy')
}

/** "Due today", "Due tomorrow", "Due Fri, Oct 17"; `overdue` when the date has passed. */
export function describeDue(dueOn: string | null, today: string): { label: string; overdue: boolean } {
  if (dueOn === null) return { label: 'No due date', overdue: false }
  const days = differenceInCalendarDays(parseDateOnly(dueOn), parseDateOnly(today))
  if (days === 0) return { label: 'Due today', overdue: false }
  if (days === 1) return { label: 'Due tomorrow', overdue: false }
  if (days === -1) return { label: 'Overdue, due yesterday', overdue: true }
  if (days < 0) return { label: `Overdue, due ${formatBillDate(dueOn, today)}`, overdue: true }
  return { label: `Due ${formatBillDate(dueOn, today)}`, overdue: false }
}

/** "Paid today", "Paid yesterday", "Paid Fri, Oct 17". */
export function describePaid(paidOn: string, today: string): string {
  const days = differenceInCalendarDays(parseDateOnly(paidOn), parseDateOnly(today))
  if (days === 0) return 'Paid today'
  if (days === -1) return 'Paid yesterday'
  return `Paid ${formatBillDate(paidOn, today)}`
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** How a recurring bill's day reads in a list. Days 29-31 land on the last day of shorter months. */
export function describeMonthlyDay(dayOfMonth: number): string {
  if (dayOfMonth >= 31) return 'Every month on the last day'
  if (dayOfMonth >= 29) return `Every month on the ${ordinal(dayOfMonth)}, or the last day in shorter months`
  return `Every month on the ${ordinal(dayOfMonth)}`
}

/** The day a recurring bill is due in the month that starts on `monthStart`, clamped to that month. */
function dueInMonth(monthStart: Date, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, getDaysInMonth(monthStart))
  return toDateInput(addDays(monthStart, day - 1))
}

/**
 * Next due date of a recurring bill on or after `today`, matching the
 * database's generate_recurring_bills (29-31 clamp to the month's last day).
 */
export function nextDueDate(dayOfMonth: number, today: string): string {
  const thisMonth = startOfMonth(parseDateOnly(today))
  const due = dueInMonth(thisMonth, dayOfMonth)
  return due >= today ? due : dueInMonth(addMonths(thisMonth, 1), dayOfMonth)
}

/**
 * When the next bill from a recurring bill is due and when it gets added
 * (`leadDays` before). `addedNow` means saving the template adds it right away.
 */
export function nextRecurringBill(
  dayOfMonth: number,
  leadDays: number,
  today: string,
): { dueOn: string; addedOn: string; addedNow: boolean } {
  const dueOn = nextDueDate(dayOfMonth, today)
  const addedOn = addDaysTo(dueOn, -leadDays)
  return { dueOn, addedOn, addedNow: addedOn <= today }
}
