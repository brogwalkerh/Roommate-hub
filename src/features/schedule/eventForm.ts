import { addDays, addHours, differenceInCalendarDays, isValid, parseISO, startOfHour } from 'date-fns'
import { parseDateOnly, toDateInput, toDateTimeInput } from '../../lib/dates'
import {
  addDaysToDateString,
  allDayFromInputs,
  allDayToInputs,
  timedFromInputs,
  timedToInputs,
  validateRange,
  type EventTimeFields,
} from './eventTime'
import type { EventRow } from './types'

/**
 * Everything the event dialog edits. It keeps both an all-day and a timed
 * version of the dates, so flipping "All day" off and on loses nothing.
 */
export type EventFormValues = {
  title: string
  allDay: boolean
  /** "yyyy-MM-dd". Used when allDay. */
  startDay: string
  /** "yyyy-MM-dd", the last day (inclusive). Used when allDay. */
  endDay: string
  /** "yyyy-MM-ddTHH:mm". Used when not allDay. */
  startAt: string
  /** "yyyy-MM-ddTHH:mm". Used when not allDay. */
  endAt: string
  /** Profile id, or null for the household. */
  ownerId: string | null
  location: string
  notes: string
}

/** The columns written to `events`. */
export type EventSaveFields = EventTimeFields & {
  title: string
  notes: string | null
  location: string | null
  owner_id: string | null
}

export type EventFormErrors = { title?: string; range?: string }

/** A span picked on the calendar. For all-day spans `end` is exclusive. */
export type Selection = { start: Date; end: Date; allDay: boolean }

const DEFAULT_START_TIME = '09:00'
const DEFAULT_END_TIME = '10:00'
const TITLE_MAX = 200

/** The next whole hour, for one hour. */
export function defaultTimedRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = addHours(startOfHour(now), 1)
  return { start, end: addHours(start, 1) }
}

function datePart(value: string): string {
  return value.slice(0, 10)
}

function timePart(value: string): string {
  return value.slice(11, 16)
}

/** Blank form, optionally prefilled from a span picked on the calendar. */
export function newEventValues(ownerId: string | null, selection?: Selection, now: Date = new Date()): EventFormValues {
  const picked = selection ?? { ...defaultTimedRange(now), allDay: false }

  if (picked.allDay) {
    const startDay = toDateInput(picked.start)
    const lastDay = toDateInput(addDays(picked.end, -1))
    const endDay = lastDay < startDay ? startDay : lastDay
    return {
      title: '',
      allDay: true,
      startDay,
      endDay,
      startAt: `${startDay}T${DEFAULT_START_TIME}`,
      endAt: `${endDay}T${DEFAULT_END_TIME}`,
      ownerId,
      location: '',
      notes: '',
    }
  }

  const end = picked.end.getTime() < picked.start.getTime() ? addHours(picked.start, 1) : picked.end
  const startAt = toDateTimeInput(picked.start)
  const endAt = toDateTimeInput(end)
  return {
    title: '',
    allDay: false,
    startDay: datePart(startAt),
    endDay: datePart(endAt),
    startAt,
    endAt,
    ownerId,
    location: '',
    notes: '',
  }
}

/** Form values for editing an existing event row. */
export function valuesFromRow(row: EventRow): EventFormValues {
  const text = { title: row.title, ownerId: row.owner_id, location: row.location ?? '', notes: row.notes ?? '' }

  if (row.all_day && row.start_date && row.end_date) {
    const { start, end } = allDayToInputs(row.start_date, row.end_date)
    return {
      ...text,
      allDay: true,
      startDay: start,
      endDay: end,
      startAt: `${start}T${DEFAULT_START_TIME}`,
      endAt: `${end}T${DEFAULT_END_TIME}`,
    }
  }

  if (!row.all_day && row.starts_at && row.ends_at) {
    const { start, end } = timedToInputs(row.starts_at, row.ends_at)
    return { ...text, allDay: false, startDay: datePart(start), endDay: datePart(end), startAt: start, endAt: end }
  }

  return { ...newEventValues(row.owner_id), ...text }
}

/** Turn "All day" on or off, carrying the dates (and times) across. */
export function setAllDay(values: EventFormValues, allDay: boolean): EventFormValues {
  if (values.allDay === allDay) return values

  if (allDay) {
    const startDay = datePart(values.startAt) || values.startDay
    const endDay = datePart(values.endAt) || values.endDay
    return { ...values, allDay, startDay, endDay: endDay < startDay ? startDay : endDay }
  }

  const startAt = `${values.startDay}T${timePart(values.startAt) || DEFAULT_START_TIME}`
  let endAt = `${values.endDay}T${timePart(values.endAt) || DEFAULT_END_TIME}`
  if (endAt < startAt) {
    const start = parseISO(startAt)
    endAt = isValid(start) ? toDateTimeInput(addHours(start, 1)) : startAt
  }
  return { ...values, allDay, startAt, endAt }
}

/**
 * Change the start. When the new start lands after the end, the end moves
 * along so the event keeps its length. Otherwise the end stays put.
 */
export function moveStart(values: EventFormValues, nextStart: string): EventFormValues {
  if (values.allDay) {
    const next = { ...values, startDay: nextStart }
    if (!isValid(parseDateOnly(nextStart)) || nextStart <= values.endDay) return next
    const spanDays = Math.max(0, differenceInCalendarDays(parseDateOnly(values.endDay), parseDateOnly(values.startDay)))
    return { ...next, endDay: addDaysToDateString(nextStart, Number.isNaN(spanDays) ? 0 : spanDays) }
  }

  const next = { ...values, startAt: nextStart }
  const start = parseISO(values.startAt)
  const end = parseISO(values.endAt)
  const nextDate = parseISO(nextStart)
  if (!isValid(nextDate) || !isValid(start) || !isValid(end) || nextStart <= values.endAt) return next
  const length = Math.max(0, end.getTime() - start.getTime())
  return { ...next, endAt: toDateTimeInput(new Date(nextDate.getTime() + length)) }
}

export function validateEventForm(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {}
  const title = values.title.trim()
  if (!title) errors.title = 'Add a title.'
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`

  const range = values.allDay
    ? validateRange(true, values.startDay, values.endDay)
    : validateRange(false, values.startAt, values.endAt)
  if (range) errors.range = range
  return errors
}

/** Validate the form and convert it to the columns saved in `events`. */
export function toSaveFields(
  values: EventFormValues,
): { ok: true; fields: EventSaveFields } | { ok: false; errors: EventFormErrors } {
  const errors = validateEventForm(values)
  if (errors.title || errors.range) return { ok: false, errors }

  const time: EventTimeFields = values.allDay
    ? { all_day: true, starts_at: null, ends_at: null, ...allDayFromInputs(values.startDay, values.endDay) }
    : { all_day: false, start_date: null, end_date: null, ...timedFromInputs(values.startAt, values.endAt) }

  return {
    ok: true,
    fields: {
      ...time,
      title: values.title.trim(),
      notes: values.notes.trim() || null,
      location: values.location.trim() || null,
      owner_id: values.ownerId,
    },
  }
}
