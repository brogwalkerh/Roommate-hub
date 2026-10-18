import FullCalendar, {
  type CalendarController,
  type DateClickInfo,
  type DateSelectInfo,
  type DatesSetInfo,
  type EventClickInfo,
  type EventDropInfo,
  type EventInput,
  type EventResizeDoneInfo,
} from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import listPlugin from '@fullcalendar/react/list'
import classicTheme from '@fullcalendar/react/themes/classic'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import { memo, useCallback, useState } from 'react'
import { addDays } from 'date-fns'
import type { Selection } from './eventForm'
import './schedule.css'
import { AGENDA_DAYS, VIEW_TYPES, type ViewKey } from './views'

const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, classicTheme]

const VIEWS = {
  // Two weeks starting today, instead of FullCalendar's calendar-aligned list views.
  listAgenda: { type: 'list', duration: { days: AGENDA_DAYS } },
}

const TIME_FORMAT = { hour: 'numeric', minute: '2-digit', meridiem: 'short' } as const

/** A drag or resize, in FullCalendar terms. `revert` puts the event back. */
export type EventTimesChange = {
  id: string
  start: Date
  end: Date | null
  allDay: boolean
  resized: boolean
  revert: () => void
}

type Props = {
  controller: CalendarController
  view: ViewKey
  events: EventInput[]
  /** Solid chips in each item's color (schedule.css). */
  bold?: boolean
  /** Square corners, tighter chips, more rows before "+n more". */
  dense?: boolean
  /** FullCalendar's own time prefix ("6a") in the month grid; off when labels carry the times. */
  showTime?: boolean
  onDatesChange: (start: Date, end: Date) => void
  onEventClick: (id: string) => void
  onCreate: (selection: Selection) => void
  onEventTimesChange: (change: EventTimesChange) => void
}

/**
 * FullCalendar with month, week and agenda views, styled to the app's tokens
 * in schedule.css. The view is chosen with `controller.changeView`; `view`
 * here only picks the first view and the matching styles.
 */
export const CalendarView = memo(function CalendarView({
  controller,
  view,
  events,
  bold = true,
  dense = false,
  showTime = true,
  onDatesChange,
  onEventClick,
  onCreate,
  onEventTimesChange,
}: Props) {
  const [initialView] = useState(() => VIEW_TYPES[view])

  const handleDatesSet = useCallback((info: DatesSetInfo) => onDatesChange(info.start, info.end), [onDatesChange])

  const handleEventClick = useCallback((info: EventClickInfo) => onEventClick(info.event.id), [onEventClick])

  // A tap fires dateClick. A mouse drag over several days or slots fires select.
  // A plain mouse click fires both, so select ignores single-cell picks.
  const handleDateClick = useCallback(
    (info: DateClickInfo) => {
      onCreate({
        start: info.date,
        end: info.allDay ? addDays(info.date, 1) : new Date(info.date.getTime() + 60 * 60 * 1000),
        allDay: info.allDay,
      })
    },
    [onCreate],
  )

  const handleSelect = useCallback(
    (info: DateSelectInfo) => {
      const spanMs = info.end.getTime() - info.start.getTime()
      const isSingleCell = info.allDay ? spanMs <= 25 * 60 * 60 * 1000 : spanMs <= 30 * 60 * 1000
      if (isSingleCell) return
      onCreate({ start: info.start, end: info.end, allDay: info.allDay })
    },
    [onCreate],
  )

  const handleChange = useCallback(
    (info: EventDropInfo | EventResizeDoneInfo, resized: boolean) => {
      if (!info.event.start) {
        info.revert()
        return
      }
      onEventTimesChange({
        id: info.event.id,
        start: info.event.start,
        end: info.event.end,
        allDay: info.event.allDay,
        resized,
        revert: info.revert,
      })
    },
    [onEventTimesChange],
  )

  const handleEventDrop = useCallback((info: EventDropInfo) => handleChange(info, false), [handleChange])
  const handleEventResize = useCallback((info: EventResizeDoneInfo) => handleChange(info, true), [handleChange])

  return (
    <div
      className={[
        'sched-cal',
        view === 'agenda' ? 'sched-cal--list' : 'sched-cal--grid',
        bold ? 'sched-cal--bold' : 'sched-cal--soft',
        dense ? 'sched-cal--dense' : '',
      ].join(' ')}
    >
      <FullCalendar
        plugins={PLUGINS}
        controller={controller}
        initialView={initialView}
        views={VIEWS}
        headerToolbar={false}
        borderless
        height={view === 'week' ? 'min(72dvh, 46rem)' : 'auto'}
        scrollTime="07:00:00"
        nowIndicator
        events={events}
        editable
        eventInteractive
        selectable
        selectMirror
        dayMaxEvents={dense ? 5 : 3}
        eventTimeFormat={TIME_FORMAT}
        displayEventTime={showTime}
        noEventsText="Nothing scheduled"
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
        dateClick={handleDateClick}
        select={handleSelect}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
      />
    </div>
  )
})
