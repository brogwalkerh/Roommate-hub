import { addDays, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { fetchWindow } from './range'
import type { DateRange } from './types'

export type ViewKey = 'month' | 'week' | 'agenda'

/** FullCalendar view names. "listAgenda" is our own list view, defined in CalendarView. */
export const VIEW_TYPES: Record<ViewKey, string> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  agenda: 'listAgenda',
}

/** Days shown at once in the agenda view. */
export const AGENDA_DAYS = 14

/** Phones open on the agenda; wider screens open on the month grid. */
export const PHONE_MAX_WIDTH_PX = 639

export function defaultViewKey(): ViewKey {
  try {
    return window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH_PX}px)`).matches ? 'agenda' : 'month'
  } catch {
    return 'month'
  }
}

/** The days a view shows around `today`, before the calendar has told us. End is exclusive. */
export function initialVisibleRange(view: ViewKey, today: Date = new Date()): DateRange {
  const day = startOfDay(today)
  switch (view) {
    case 'month':
      return { start: startOfWeek(startOfMonth(day)), end: addDays(startOfDay(endOfWeek(endOfMonth(day))), 1) }
    case 'week':
      return { start: startOfWeek(day), end: addDays(startOfWeek(day), 7) }
    case 'agenda':
      return { start: day, end: addDays(day, AGENDA_DAYS) }
  }
}

/** The span to load before the calendar reports its own dates. */
export function initialFetchWindow(view: ViewKey, today: Date = new Date()): DateRange {
  const visible = initialVisibleRange(view, today)
  return fetchWindow(visible.start, visible.end)
}
