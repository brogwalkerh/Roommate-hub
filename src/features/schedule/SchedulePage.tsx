import { useCalendarController } from '@fullcalendar/react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Plus, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { EmptyState, PageHeader } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { useMembers } from '../../household/useHousehold'
import { qk } from '../../lib/queryClient'
import { toCalendarEvent } from './calendarEvents'
import { CalendarView, type EventTimesChange } from './CalendarView'
import { EventDialog, type EditorTarget } from './EventDialog'
import { newEventValues, type Selection } from './eventForm'
import { calendarTimesToFields } from './eventTime'
import { FeedEventDialog } from './FeedEventDialog'
import { feedFilterKey, isItemVisible, loadHidden, saveHidden, toggleHidden, type FilterKey } from './filters'
import { FilterChips, type FilterChip } from './FilterChips'
import { fetchWindow } from './range'
import { ScheduleToolbar } from './ScheduleToolbar'
import { GUEST_COLOR, HOUSEHOLD_COLOR } from './items'
import { useCalendarFeeds, useCalendarItems, useHasNoEvents, useSaveEvent } from './hooks'
import type { CalendarItem, DateRange, FeedItem } from './types'
import { defaultViewKey, initialFetchWindow, VIEW_TYPES, type ViewKey } from './views'

const HOUR_MS = 60 * 60 * 1000

export default function SchedulePage() {
  const { me, roommate } = useMembers()
  const queryClient = useQueryClient()
  const controller = useCalendarController()
  const [view, setView] = useState<ViewKey>(defaultViewKey)
  const [range, setRange] = useState<DateRange>(() => initialFetchWindow(view))
  const [hidden, setHidden] = useState<FilterKey[]>(loadHidden)
  const [editor, setEditor] = useState<{ target: EditorTarget; open: boolean } | null>(null)
  const [details, setDetails] = useState<{ item: FeedItem; open: boolean } | null>(null)

  const { items, isLoading, error } = useCalendarItems(range)
  const feedsQuery = useCalendarFeeds()
  const { hasNoEvents, isLoading: checkingEvents } = useHasNoEvents()
  const { mutate: saveEvent } = useSaveEvent()

  const feeds = feedsQuery.data
  const meId = me?.id ?? null

  const visibleItems = useMemo(() => items.filter((item) => isItemVisible(item, hidden, meId)), [items, hidden, meId])
  const calendarEvents = useMemo(() => visibleItems.map(toCalendarEvent), [visibleItems])

  // Handlers given to the calendar read the latest items from here, so they can stay stable.
  const itemsById = useRef(new Map<string, CalendarItem>())
  useEffect(() => {
    itemsById.current = new Map(items.map((item) => [item.id, item]))
  }, [items])

  const chips = useMemo<FilterChip[]>(() => {
    const personalFeeds = (feeds ?? []).filter((feed) => feed.kind === 'ical')
    return [
      { key: 'me', label: 'Me', color: me?.color ?? HOUSEHOLD_COLOR },
      ...(roommate ? [{ key: 'roommate', label: roommate.display_name, color: roommate.color }] : []),
      { key: 'household', label: 'Household', color: HOUSEHOLD_COLOR },
      { key: 'stays', label: 'Guest stays', color: GUEST_COLOR },
      { key: 'blocked', label: 'Blocked dates', color: 'var(--muted)' },
      ...personalFeeds.map((feed) => ({ key: feedFilterKey(feed.id), label: feed.name, color: feed.color })),
    ]
  }, [feeds, me, roommate])

  const toggleChip = (key: FilterKey) => {
    const next = toggleHidden(hidden, key)
    setHidden(next)
    saveHidden(next)
  }

  const openCreate = useCallback(
    (selection?: Selection) => {
      setEditor({ target: { mode: 'create', values: newEventValues(meId, selection) }, open: true })
    },
    [meId],
  )

  const handleEventClick = useCallback((id: string) => {
    const item = itemsById.current.get(id)
    if (!item) return
    if (item.source === 'event') setEditor({ target: { mode: 'edit', item }, open: true })
    else setDetails({ item, open: true })
  }, [])

  const handleTimesChange = useCallback(
    ({ id, start, end, allDay, resized, revert }: EventTimesChange) => {
      const item = itemsById.current.get(id)
      if (item?.source !== 'event') {
        revert()
        return
      }
      // Dropping an all-day event onto a time slot (or the reverse) changes its shape,
      // so its old length no longer applies.
      const keepsShape = item.allDay === allDay
      const fallbackMs = keepsShape ? item.end.getTime() - item.start.getTime() : HOUR_MS
      saveEvent(
        {
          id,
          fields: calendarTimesToFields({ start, end, allDay }, fallbackMs),
          message: resized ? 'Event updated' : 'Event moved',
        },
        { onError: revert },
      )
    },
    [saveEvent],
  )

  const handleDatesChange = useCallback((start: Date, end: Date) => {
    const next = fetchWindow(start, end)
    setRange((current) =>
      current.start.getTime() === next.start.getTime() && current.end.getTime() === next.end.getTime() ? current : next,
    )
  }, [])

  const changeView = (next: ViewKey) => {
    setView(next)
    controller.changeView(VIEW_TYPES[next])
  }

  const retry = () => {
    void queryClient.invalidateQueries({ queryKey: qk.events })
    void queryClient.invalidateQueries({ queryKey: qk.feedEvents })
  }

  const failingFeeds = (feeds ?? []).filter((feed) => feed.last_error)
  const showEmptyState = hasNoEvents === true && feeds !== undefined && feeds.length === 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Schedule"
        actions={
          <Button variant="primary" icon={<Plus className="size-5" aria-hidden />} onClick={() => openCreate()}>
            Add event
          </Button>
        }
      />

      {showEmptyState ? (
        <EmptyState icon={<CalendarDays aria-hidden />} title="Nothing on the calendar yet">
          <p>
            Add events for yourself or the whole household. To see Airbnb guests here too, connect your Airbnb calendar in{' '}
            <Link to="/settings" className="font-medium text-accent underline underline-offset-2">
              Settings
            </Link>
            .
          </p>
        </EmptyState>
      ) : checkingEvents || feedsQuery.isLoading ? (
        <LoadingBlock label="Loading your calendar" />
      ) : (
        <>
          <FilterChips chips={chips} hidden={hidden} onToggle={toggleChip} />

          {failingFeeds.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm text-warn">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Couldn’t update {failingFeeds.map((feed) => `“${feed.name}”`).join(' and ')}, so it may be out of date.{' '}
                <Link to="/settings" className="font-medium underline underline-offset-2">
                  Check the link in Settings
                </Link>
                .
              </p>
            </div>
          )}

          {error != null && <ErrorBlock error={error} onRetry={retry} />}

          <div className="flex flex-col gap-4">
            <ScheduleToolbar
              controller={controller}
              title={controller.view?.title ?? ''}
              view={view}
              onViewChange={changeView}
              loading={isLoading}
            />
            <CalendarView
              controller={controller}
              view={view}
              events={calendarEvents}
              onDatesChange={handleDatesChange}
              onEventClick={handleEventClick}
              onCreate={openCreate}
              onEventTimesChange={handleTimesChange}
            />
          </div>
        </>
      )}

      {editor && (
        <EventDialog
          open={editor.open}
          target={editor.target}
          onClose={() => setEditor((current) => current && { ...current, open: false })}
        />
      )}
      {details && (
        <FeedEventDialog
          open={details.open}
          item={details.item}
          onClose={() => setDetails((current) => current && { ...current, open: false })}
        />
      )}
    </div>
  )
}
