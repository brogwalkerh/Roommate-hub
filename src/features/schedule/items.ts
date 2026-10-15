import { addDays, isValid } from 'date-fns'
import { parseDateOnly } from '../../lib/dates'
import type { Profile } from '../../household/useHousehold'
import { isAirbnbBooking, nightsBetween, parseAirbnbDescription, safeAirbnbUrl } from './airbnb'
import type {
  CalendarItem,
  EventItem,
  EventRow,
  FeedEventWithFeed,
  FeedItem,
  FeedMeta,
  GuestStay,
} from './types'

/** Household events and Airbnb stays use design tokens, so they follow the theme. */
export const HOUSEHOLD_COLOR = 'var(--accent)'
export const GUEST_COLOR = 'var(--guest)'
export const BLOCKED_COLOR = 'var(--muted)'

type TimeColumns = Pick<EventRow, 'all_day' | 'starts_at' | 'ends_at' | 'start_date' | 'end_date'>

/**
 * Read the time columns of an events or feed_events row.
 * All-day rows use local midnight dates with an exclusive end.
 * Returns null for a row without a usable start.
 */
export function rowTimes(row: TimeColumns): { start: Date; end: Date; allDay: boolean } | null {
  if (row.all_day) {
    if (!row.start_date) return null
    const start = parseDateOnly(row.start_date)
    if (!isValid(start)) return null
    let end = row.end_date ? parseDateOnly(row.end_date) : addDays(start, 1)
    if (!isValid(end) || end.getTime() <= start.getTime()) end = addDays(start, 1)
    return { start, end, allDay: true }
  }

  if (!row.starts_at) return null
  const start = new Date(row.starts_at)
  if (!isValid(start)) return null
  let end = row.ends_at ? new Date(row.ends_at) : start
  if (!isValid(end) || end.getTime() < start.getTime()) end = start
  return { start, end, allDay: false }
}

export function eventRowToItem(row: EventRow, members: Pick<Profile, 'id' | 'color'>[]): EventItem | null {
  const times = rowTimes(row)
  if (!times) return null
  const owner = row.owner_id ? members.find((m) => m.id === row.owner_id) : undefined
  return {
    id: row.id,
    source: 'event',
    kind: 'event',
    title: row.title,
    ...times,
    color: owner?.color ?? HOUSEHOLD_COLOR,
    ownerId: row.owner_id,
    editable: true,
    raw: row,
  }
}

/** An Airbnb booking as a guest stay. Returns null when the row has no usable dates. */
export function buildGuestStay(row: FeedEventWithFeed, feed: FeedMeta): GuestStay | null {
  const times = rowTimes(row)
  if (!times) return null
  const details = parseAirbnbDescription(row.description)
  const stay: GuestStay = {
    id: row.id,
    checkIn: times.start,
    checkOut: times.end,
    nights: nightsBetween(times.start, times.end),
    feedName: feed.name,
  }
  const reservationUrl = details.reservationUrl ?? (row.url ? safeAirbnbUrl(row.url) : undefined)
  if (reservationUrl) stay.reservationUrl = reservationUrl
  if (details.phoneLast4) stay.phoneLast4 = details.phoneLast4
  return stay
}

export function feedRowToItem(row: FeedEventWithFeed): FeedItem | null {
  const feed = row.calendar_feeds
  const times = rowTimes(row)
  if (!feed || !times) return null

  const base = {
    id: row.id,
    source: 'feed' as const,
    ...times,
    ownerId: feed.owner_id,
    editable: false as const,
    feedId: feed.id,
    feedKind: feed.kind,
    feed,
    raw: row,
  }

  if (feed.kind === 'airbnb') {
    if (isAirbnbBooking(row.summary)) {
      const stay = buildGuestStay(row, feed)
      return { ...base, kind: 'stay', title: 'Guest stay', color: GUEST_COLOR, ...(stay && { stay }) }
    }
    return { ...base, kind: 'blocked', title: 'Blocked', color: BLOCKED_COLOR }
  }

  // A "busy" feed shares only that you're occupied, whatever the sync stored.
  const title = feed.privacy === 'busy' ? 'Busy' : row.summary?.trim() || 'Untitled event'
  return { ...base, kind: 'personal', title, color: feed.color }
}

/** Order items by start, with all-day items before timed ones on the same day. */
export function compareItems(a: CalendarItem, b: CalendarItem): number {
  return (
    a.start.getTime() - b.start.getTime() ||
    Number(b.allDay) - Number(a.allDay) ||
    a.end.getTime() - b.end.getTime() ||
    a.title.localeCompare(b.title)
  )
}

export function buildCalendarItems(input: {
  events: EventRow[]
  feedEvents: FeedEventWithFeed[]
  members: Pick<Profile, 'id' | 'color'>[]
}): CalendarItem[] {
  const items: CalendarItem[] = []
  for (const row of input.events) {
    const item = eventRowToItem(row, input.members)
    if (item) items.push(item)
  }
  for (const row of input.feedEvents) {
    const item = feedRowToItem(row)
    if (item) items.push(item)
  }
  return items.sort(compareItems)
}

/** Guest stays from Airbnb feed rows, soonest check-in first. */
export function buildGuestStays(feedEvents: FeedEventWithFeed[]): GuestStay[] {
  const stays: GuestStay[] = []
  for (const row of feedEvents) {
    const feed = row.calendar_feeds
    if (!feed || feed.kind !== 'airbnb' || !isAirbnbBooking(row.summary)) continue
    const stay = buildGuestStay(row, feed)
    if (stay) stays.push(stay)
  }
  return stays.sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime())
}
