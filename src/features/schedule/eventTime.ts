import { addDays, isValid, parseISO } from 'date-fns'
import { fromDateTimeInput, parseDateOnly, toDateInput, toDateTimeInput } from '../../lib/dates'

/**
 * Event times in the database versus on screen.
 *
 * - All-day events store `start_date` and an exclusive `end_date` (the morning
 *   after the last day). The form shows an inclusive "Ends" date.
 * - Timed events store ISO timestamps. The form uses local `datetime-local`
 *   values ("yyyy-MM-ddTHH:mm").
 */

/** The four time columns on `events`, set so the table's shape check passes. */
export type EventTimeFields = {
  all_day: boolean
  starts_at: string | null
  ends_at: string | null
  start_date: string | null
  end_date: string | null
}

const HOUR_MS = 60 * 60 * 1000

/** Add whole days to a "yyyy-MM-dd" string. */
export function addDaysToDateString(value: string, days: number): string {
  return toDateInput(addDays(parseDateOnly(value), days))
}

/** Database dates (exclusive end) -> form dates (inclusive end). */
export function allDayToInputs(startDate: string, endDateExclusive: string): { start: string; end: string } {
  const last = addDaysToDateString(endDateExclusive, -1)
  return { start: startDate, end: last < startDate ? startDate : last }
}

/** Form dates (inclusive end) -> database dates (exclusive end). */
export function allDayFromInputs(start: string, endInclusive: string): { start_date: string; end_date: string } {
  return { start_date: start, end_date: addDaysToDateString(endInclusive, 1) }
}

/** Database timestamps -> `datetime-local` values in the viewer's time zone. */
export function timedToInputs(startsAt: string, endsAt: string): { start: string; end: string } {
  return { start: toDateTimeInput(new Date(startsAt)), end: toDateTimeInput(new Date(endsAt)) }
}

/** `datetime-local` values -> ISO timestamps for the database. */
export function timedFromInputs(start: string, end: string): { starts_at: string; ends_at: string } {
  return { starts_at: fromDateTimeInput(start), ends_at: fromDateTimeInput(end) }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

function isValidInput(value: string, allDay: boolean): boolean {
  return (allDay ? DATE_RE : DATE_TIME_RE).test(value) && isValid(parseISO(value))
}

/**
 * Check a start and end from the form. Returns a sentence to show the person,
 * or null when the range is fine. The end may equal the start.
 */
export function validateRange(allDay: boolean, start: string, end: string): string | null {
  if (!isValidInput(start, allDay) || !isValidInput(end, allDay)) {
    return allDay ? 'Pick a start and end date.' : 'Pick a start and end time.'
  }
  // Same-format ISO strings sort the same way as the moments they name.
  if (end < start) {
    return allDay ? 'The end date can’t be before the start date.' : 'The end can’t be before the start.'
  }
  return null
}

/**
 * FullCalendar's view of an event after a drag or resize, as database columns.
 * FullCalendar drops `end` for events that run for its default length, so
 * `fallbackMs` says how long a timed event lasts then.
 */
export function calendarTimesToFields(
  times: { start: Date; end: Date | null; allDay: boolean },
  fallbackMs: number = HOUR_MS,
): EventTimeFields {
  if (times.allDay) {
    const startDate = toDateInput(times.start)
    let endDate = times.end ? toDateInput(times.end) : addDaysToDateString(startDate, 1)
    if (endDate <= startDate) endDate = addDaysToDateString(startDate, 1)
    return { all_day: true, starts_at: null, ends_at: null, start_date: startDate, end_date: endDate }
  }
  const end = times.end ?? new Date(times.start.getTime() + fallbackMs)
  return {
    all_day: false,
    starts_at: times.start.toISOString(),
    ends_at: (end.getTime() < times.start.getTime() ? times.start : end).toISOString(),
    start_date: null,
    end_date: null,
  }
}
