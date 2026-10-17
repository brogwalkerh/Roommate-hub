import { addHours, differenceInCalendarDays, isValid, parseISO } from 'date-fns'
import { parseDateOnly, toDateTimeInput } from '../../../lib/dates'
import type { EventSaveFields } from '../eventForm'
import { addDaysToDateString, allDayFromInputs, timedFromInputs } from '../eventTime'
import type { DateRange, EventRow } from '../types'

/** One event as parse-schedule returns it (local wall-clock times). */
export type ParsedEvent = {
  title: string
  date: string
  endDate: string
  allDay: boolean
  startTime: string
  endTime: string
  location: string
  notes: string
  /** An OFF / leave / holiday entry rather than somewhere to be. */
  dayOff: boolean
}

/** One line in the review list. Everything in it can be edited before adding. */
export type ImportRow = {
  key: string
  include: boolean
  /** Same name and start as an event already on the calendar. */
  duplicate: boolean
  /** A day off: shown, but unticked until the person wants it. */
  dayOff: boolean
  /** A weekly copy made by expandWeekly, not something the file said. */
  generated?: boolean
  title: string
  allDay: boolean
  /** "yyyy-MM-dd" */
  startDay: string
  /** "yyyy-MM-dd", last day (inclusive). Used when allDay. */
  endDay: string
  /** "HH:mm". Used when not allDay. */
  startTime: string
  /** "HH:mm", or "" for an hour after the start. Earlier than startTime ends the next day. */
  endTime: string
  location: string
  notes: string
}

type ExistingEvent = Pick<EventRow, 'title' | 'all_day' | 'starts_at' | 'start_date'>

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const TITLE_MAX = 200
/** Weekly copies never run further than this, whatever the end date says. */
const MAX_REPEATS = 110

const isDay = (value: string) => DATE_RE.test(value) && isValid(parseISO(value))

/** Start and end as datetime-local values for a timed row. */
export function timedRange(row: Pick<ImportRow, 'startDay' | 'startTime' | 'endTime'>): { start: string; end: string } {
  const start = `${row.startDay}T${row.startTime}`
  if (!TIME_RE.test(row.endTime)) return { start, end: toDateTimeInput(addHours(parseISO(start), 1)) }
  const endDay = row.endTime <= row.startTime ? addDaysToDateString(row.startDay, 1) : row.startDay
  return { start, end: `${endDay}T${row.endTime}` }
}

function sameEventKey(title: string, start: string): string {
  return `${title.trim().toLowerCase()}|${start}`
}

function existingKey(e: ExistingEvent): string | null {
  if (e.all_day) return e.start_date ? sameEventKey(e.title, `d:${e.start_date}`) : null
  return e.starts_at ? sameEventKey(e.title, `t:${new Date(e.starts_at).getTime()}`) : null
}

/** The "same event" keys (name + start) of events already on the calendar. */
export function existingKeys(existing: ExistingEvent[]): Set<string> {
  return new Set(existing.map(existingKey).filter((k): k is string => k !== null))
}

function rowKey(row: ImportRow): string | null {
  if (!isDay(row.startDay)) return null
  if (row.allDay) return sameEventKey(row.title, `d:${row.startDay}`)
  if (!TIME_RE.test(row.startTime)) return null
  return sameEventKey(row.title, `t:${parseISO(`${row.startDay}T${row.startTime}`).getTime()}`)
}

/** True when an event with the row's name and start is already on the calendar. */
export function isDuplicate(row: ImportRow, taken: Set<string>): boolean {
  const key = rowKey(row)
  return key !== null && taken.has(key)
}

/** Review rows for the parsed events. Duplicates and days off start unticked. */
export function rowsFromParsed(events: ParsedEvent[], existing: ExistingEvent[]): ImportRow[] {
  const taken = existingKeys(existing)
  return events.map((e, i) => {
    const row: ImportRow = {
      key: String(i),
      include: true,
      duplicate: false,
      dayOff: e.dayOff,
      title: e.title.slice(0, TITLE_MAX),
      allDay: e.allDay,
      startDay: e.date,
      endDay: e.allDay && e.endDate >= e.date ? e.endDate : e.date,
      startTime: e.allDay ? '' : e.startTime,
      endTime: e.allDay ? '' : e.endTime,
      location: e.location,
      notes: e.notes,
    }
    row.duplicate = isDuplicate(row, taken)
    row.include = !row.duplicate && !row.dayOff
    return row
  })
}

/** What's wrong with a row, as a sentence, or null when it can be added. */
export function rowProblem(row: ImportRow): string | null {
  if (row.title.trim() === '') return 'Add a name.'
  if (!isDay(row.startDay)) return 'Pick a date.'
  if (row.allDay) {
    if (!isDay(row.endDay)) return 'Pick an end date.'
    if (row.endDay < row.startDay) return 'The end date can’t be before the start date.'
    return null
  }
  if (!TIME_RE.test(row.startTime)) return 'Pick a start time.'
  return null
}

/** Database columns for a row. Only call this when rowProblem(row) is null. */
export function rowToFields(row: ImportRow, ownerId: string | null): EventSaveFields {
  const times = row.allDay
    ? { all_day: true, starts_at: null, ends_at: null, ...allDayFromInputs(row.startDay, row.endDay) }
    : (() => {
        const { start, end } = timedRange(row)
        return { all_day: false, start_date: null, end_date: null, ...timedFromInputs(start, end) }
      })()
  return {
    ...times,
    title: row.title.trim(),
    location: row.location.trim() || null,
    notes: row.notes.trim() || null,
    owner_id: ownerId,
  }
}

/** Days from the first row's start to the last row's start (0 for a single day). */
export function rowsSpanDays(rows: Pick<ImportRow, 'startDay'>[]): number {
  const days = rows.map((r) => r.startDay).filter(isDay).sort()
  if (days.length < 2) return 0
  return differenceInCalendarDays(parseDateOnly(days[days.length - 1]), parseDateOnly(days[0]))
}

/** The last start day among the rows, or null. */
export function lastStartDay(rows: Pick<ImportRow, 'startDay'>[]): string | null {
  const days = rows.map((r) => r.startDay).filter(isDay).sort()
  return days.length ? days[days.length - 1] : null
}

/**
 * The rows plus copies every `everyWeeks` weeks, for every copy that starts on
 * or before `until` (inclusive). Copies are marked `generated` so duplicates
 * among them can be skipped without second-guessing what the person ticked.
 */
export function expandWeekly(rows: ImportRow[], everyWeeks: number, until: string): ImportRow[] {
  const step = Math.max(1, Math.round(everyWeeks)) * 7
  if (!isDay(until)) return rows
  const out: ImportRow[] = []
  for (const row of rows) {
    out.push(row)
    if (!isDay(row.startDay)) continue
    for (let k = 1; k <= MAX_REPEATS; k++) {
      const startDay = addDaysToDateString(row.startDay, k * step)
      if (startDay > until) break
      out.push({
        ...row,
        key: `${row.key}+${k}`,
        generated: true,
        startDay,
        endDay: isDay(row.endDay) ? addDaysToDateString(row.endDay, k * step) : startDay,
      })
    }
  }
  return out
}

/** The days the items cover, for looking up what's already on the calendar. */
export function daysRange(items: Array<{ date: string; endDate: string }>): DateRange | null {
  const days = items.flatMap((e) => [e.date, e.endDate]).filter(isDay).sort()
  if (days.length === 0) return null
  // One extra day each side covers overnight shifts and time-zone edges.
  return {
    start: parseDateOnly(addDaysToDateString(days[0], -1)),
    end: parseDateOnly(addDaysToDateString(days[days.length - 1], 2)),
  }
}

export const parsedRange = daysRange

/** daysRange for review rows. */
export function rowsRange(rows: ImportRow[]): DateRange | null {
  return daysRange(rows.map((r) => ({ date: r.startDay, endDate: r.allDay ? r.endDay : r.startDay })))
}
