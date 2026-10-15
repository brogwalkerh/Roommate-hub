import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useToast } from '../../components/ui/Toast'
import { useMembers, type Profile } from '../../household/useHousehold'
import type { TablesUpdate } from '../../lib/database.types'
import { friendlyError, unwrap } from '../../lib/errors'
import { qk } from '../../lib/queryClient'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/useRealtime'
import type { EventSaveFields } from './eventForm'
import { buildCalendarItems, buildGuestStays } from './items'
import { overlapFilter, toDayWindow } from './range'
import type { CalendarItem, DateRange, EventRow, FeedEventWithFeed, FeedMeta, GuestStay } from './types'

export type { CalendarItem, DateRange, EventItem, FeedItem, FeedMeta, GuestStay, ItemKind } from './types'

const NO_MEMBERS: Profile[] = []

/** Feed columns clients may read. `url` is a secret and cannot be selected. */
const FEED_COLUMNS = 'id, name, kind, color, owner_id, privacy, url_hint, last_synced_at, last_error'

function useEventRows(range: DateRange) {
  const win = toDayWindow(range)
  useRealtime('events', qk.events)
  return useQuery({
    queryKey: [...qk.events, 'range', win.startIso, win.endIso],
    queryFn: async (): Promise<EventRow[]> =>
      unwrap(await supabase.from('events').select('*').or(overlapFilter(win))) ?? [],
    placeholderData: keepPreviousData,
  })
}

function useFeedEventRows(range: DateRange) {
  const win = toDayWindow(range)
  // A sync also updates the feed's last_synced_at / last_error.
  useRealtime('feed_events', qk.feedEvents, qk.feeds)
  return useQuery({
    queryKey: [...qk.feedEvents, 'range', win.startIso, win.endIso],
    queryFn: async (): Promise<FeedEventWithFeed[]> => {
      const rows = unwrap(
        await supabase
          .from('feed_events')
          .select(`*, calendar_feeds (${FEED_COLUMNS})`)
          .or(overlapFilter(win)),
      )
      return (rows ?? []) as unknown as FeedEventWithFeed[]
    },
    placeholderData: keepPreviousData,
  })
}

/**
 * Native events and external feed events overlapping `range`, merged and
 * sorted by start. Includes Airbnb "Blocked" dates (kind 'blocked'); hide them
 * where they aren't wanted. `range.end` is exclusive.
 */
export function useCalendarItems(range: DateRange): { items: CalendarItem[]; isLoading: boolean; error: unknown } {
  const { data } = useMembers()
  const members = data ?? NO_MEMBERS
  const events = useEventRows(range)
  const feedEvents = useFeedEventRows(range)

  const eventRows = events.data
  const feedRows = feedEvents.data
  const items = useMemo(
    () => buildCalendarItems({ events: eventRows ?? [], feedEvents: feedRows ?? [], members }),
    [eventRows, feedRows, members],
  )

  return {
    items,
    isLoading: events.isLoading || feedEvents.isLoading,
    error: events.error ?? feedEvents.error,
  }
}

/** Airbnb bookings overlapping `range`, soonest check-in first. `range.end` is exclusive. */
export function useGuestStays(range: DateRange): { stays: GuestStay[]; isLoading: boolean } {
  const feedEvents = useFeedEventRows(range)
  const feedRows = feedEvents.data
  const stays = useMemo(() => buildGuestStays(feedRows ?? []), [feedRows])
  return { stays, isLoading: feedEvents.isLoading }
}

/** Connected calendars (Airbnb and personal), without their secret links. */
export function useCalendarFeeds() {
  return useQuery({
    queryKey: [...qk.feeds, 'list'],
    queryFn: async (): Promise<FeedMeta[]> =>
      unwrap(await supabase.from('calendar_feeds').select(FEED_COLUMNS).order('created_at', { ascending: true })) ?? [],
  })
}

/**
 * Whether the household has any native event at all, in any month. The
 * Schedule page uses it to tell "nothing in this month" from "nothing yet".
 */
export function useHasNoEvents(): { hasNoEvents: boolean | undefined; isLoading: boolean } {
  useRealtime('events', qk.events)
  const { data, isLoading } = useQuery({
    queryKey: [...qk.events, 'count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('events').select('id', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    },
  })
  return { hasNoEvents: data === undefined ? undefined : data === 0, isLoading }
}

/** Add a new event, or change some columns of an existing one. */
export type SaveEventInput =
  | { id?: undefined; fields: EventSaveFields; message?: string }
  | { id: string; fields: TablesUpdate<'events'>; message?: string }

export function useSaveEvent() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (input: SaveEventInput) => {
      if (input.id !== undefined) {
        return unwrap(await supabase.from('events').update(input.fields).eq('id', input.id).select().single())
      }
      return unwrap(await supabase.from('events').insert(input.fields).select().single())
    },
    onSuccess: (_row, { id, message }) => {
      void queryClient.invalidateQueries({ queryKey: qk.events })
      toast(message ?? (id ? 'Event saved' : 'Event added'))
    },
    onError: (error) => toast(friendlyError(error), { tone: 'error' }),
  })
}

export function useDeleteEvent() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('events').delete().eq('id', id))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.events })
      toast('Event deleted')
    },
    onError: (error) => toast(friendlyError(error), { tone: 'error' }),
  })
}
