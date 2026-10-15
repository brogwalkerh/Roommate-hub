import { addDays, addMonths, startOfDay, startOfMonth } from 'date-fns'
import { toDateInput } from '../../lib/dates'
import type { DateRange } from './types'

export type DayWindow = {
  start: Date
  /** Exclusive: midnight after the last day. */
  end: Date
  /** "yyyy-MM-dd" of the first day. */
  startDate: string
  /** "yyyy-MM-dd" of the day after the last day (exclusive). */
  endDate: string
  startIso: string
  endIso: string
}

/**
 * Snap a range outward to whole local days. Callers often pass `new Date()`-based
 * ranges that change every render; whole days give queries a stable key.
 */
export function toDayWindow(range: DateRange): DayWindow {
  const start = startOfDay(range.start)
  let end = startOfDay(range.end)
  if (end.getTime() < range.end.getTime()) end = addDays(end, 1)
  if (end.getTime() <= start.getTime()) end = addDays(start, 1)
  return {
    start,
    end,
    startDate: toDateInput(start),
    endDate: toDateInput(end),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

/**
 * The span to load for what the calendar shows: whole calendar months. Paging
 * through weeks or days inside a month then needs no new request.
 * `visibleEnd` is exclusive.
 */
export function fetchWindow(visibleStart: Date, visibleEnd: Date): DateRange {
  const start = startOfMonth(visibleStart)
  const lastVisibleInstant = new Date(Math.max(visibleEnd.getTime() - 1, visibleStart.getTime()))
  const end = addMonths(startOfMonth(lastVisibleInstant), 1)
  return { start, end }
}

/**
 * A PostgREST `or=` filter for rows overlapping a day window, for tables with
 * the events column shape: timed rows by their timestamps, all-day rows by
 * their dates (end_date is exclusive). A row with no end counts as lasting
 * only at its start, which is how feeds store events without a DTEND.
 */
export function overlapFilter(win: DayWindow): string {
  const timed = [
    'all_day.eq.false',
    `starts_at.lt.${win.endIso}`,
    `or(ends_at.gte.${win.startIso},and(ends_at.is.null,starts_at.gte.${win.startIso}))`,
  ]
  const allDay = [
    'all_day.eq.true',
    `start_date.lt.${win.endDate}`,
    `or(end_date.gt.${win.startDate},and(end_date.is.null,start_date.gte.${win.startDate}))`,
  ]
  return `and(${timed.join(',')}),and(${allDay.join(',')})`
}
