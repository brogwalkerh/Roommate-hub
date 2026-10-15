import type { EventInput } from '@fullcalendar/react'
import { toDateInput } from '../../lib/dates'
import type { CalendarItem } from './types'

/**
 * A calendar item as a FullCalendar event. All-day items go in as date strings
 * so no time zone can shift them; their end is already exclusive.
 * Colors are CSS values (hex or `var(--token)`); schedule.css tints them.
 */
export function toCalendarEvent(item: CalendarItem): EventInput {
  return {
    id: item.id,
    title: item.title,
    allDay: item.allDay,
    start: item.allDay ? toDateInput(item.start) : item.start,
    end: item.allDay ? toDateInput(item.end) : item.end,
    display: 'block',
    color: item.color,
    contrastColor: item.kind === 'blocked' ? 'var(--muted)' : 'var(--ink)',
    editable: item.editable,
    className: `sched-ev sched-ev--${item.kind}`,
  }
}
