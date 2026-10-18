import type { EventInput } from '@fullcalendar/react'
import { toDateInput } from '../../lib/dates'
import type { CalendarItem } from './types'

export type CalendarEventOptions = {
  /** Text for the chip instead of the item's title (see display.ts). */
  label?: string
  /** Solid blocks: the text color has to work on the item's own color. */
  bold?: boolean
}

/** Text color on top of the item's color when chips are solid. */
function boldContrast(item: CalendarItem): string {
  if (item.kind === 'stay') return 'var(--guest-ink)'
  if (item.kind === 'event' && item.ownerId === null) return 'var(--accent-ink)' // household: var(--accent)
  return 'var(--vivid-ink)' // a person's or feed's own color (always a mid or dark hex)
}

/**
 * A calendar item as a FullCalendar event. All-day items go in as date strings
 * so no time zone can shift them; their end is already exclusive.
 * Colors are CSS values (hex or `var(--token)`); schedule.css tints or fills them.
 */
export function toCalendarEvent(item: CalendarItem, options: CalendarEventOptions = {}): EventInput {
  const classes = ['sched-ev', `sched-ev--${item.kind}`]
  if (item.kind === 'event' && item.ownerId === null) classes.push('sched-ev--household')
  return {
    id: item.id,
    title: options.label ?? item.title,
    allDay: item.allDay,
    start: item.allDay ? toDateInput(item.start) : item.start,
    end: item.allDay ? toDateInput(item.end) : item.end,
    display: 'block',
    color: item.color,
    contrastColor: item.kind === 'blocked' ? 'var(--muted)' : options.bold ? boldContrast(item) : 'var(--ink)',
    editable: item.editable,
    className: classes.join(' '),
  }
}
