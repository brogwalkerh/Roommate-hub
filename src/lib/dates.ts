import { addDays, format, isSameDay, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns'

/** "2026-10-15" for a Date in the viewer's local time zone. */
export function toDateInput(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** "2026-10-15T09:30" for <input type="datetime-local">. */
export function toDateTimeInput(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

/** Local "yyyy-MM-ddTHH:mm" from an input -> ISO string with offset for the database. */
export function fromDateTimeInput(value: string): string {
  return new Date(value).toISOString()
}

/** Parse a date-only "yyyy-MM-dd" as local midnight (parseISO does this; new Date() would use UTC). */
export function parseDateOnly(value: string): Date {
  return parseISO(value)
}

/** "Today", "Tomorrow", "Yesterday" or "Fri, Oct 17". */
export function formatDay(d: Date): string {
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return format(d, sameYear ? 'EEE, MMM d' : 'EEE, MMM d, yyyy')
}

/** "9:30 AM" */
export function formatTime(d: Date): string {
  return format(d, 'h:mm a')
}

/** "Today, 9:30 AM" */
export function formatDayTime(d: Date): string {
  return `${formatDay(d)}, ${formatTime(d)}`
}

/** Time range for an event on one or more days. `endExclusive` dates follow iCalendar. */
export function formatRange(
  start: Date,
  end: Date,
  allDay: boolean,
): string {
  if (allDay) {
    const lastDay = addDays(end, -1)
    return isSameDay(start, lastDay) ? formatDay(start) : `${formatDay(start)} – ${formatDay(lastDay)}`
  }
  if (isSameDay(start, end)) return `${formatDay(start)}, ${formatTime(start)} – ${formatTime(end)}`
  return `${formatDayTime(start)} – ${formatDayTime(end)}`
}

/** The viewer's IANA time zone, e.g. "America/Los_Angeles". */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
