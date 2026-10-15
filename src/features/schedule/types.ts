import type { Tables } from '../../lib/database.types'

export type EventRow = Tables<'events'>
export type FeedEventRow = Tables<'feed_events'>

/** The calendar_feeds columns clients may read. The `url` column is write-only. */
export type FeedMeta = Pick<
  Tables<'calendar_feeds'>,
  'id' | 'name' | 'kind' | 'color' | 'owner_id' | 'privacy' | 'url_hint' | 'last_synced_at' | 'last_error'
>

/** A feed_events row with its feed's metadata joined in. */
export type FeedEventWithFeed = FeedEventRow & { calendar_feeds: FeedMeta | null }

/** A visible span of days. `end` is exclusive. */
export type DateRange = { start: Date; end: Date }

/**
 * What a calendar item is, for filtering and styling:
 * - event: a native event that either of you can edit
 * - personal: an event from a personal iCal feed (read-only)
 * - stay: an Airbnb booking
 * - blocked: dates Airbnb marks unavailable
 */
export type ItemKind = 'event' | 'personal' | 'stay' | 'blocked'

type ItemBase = {
  /** The database row id (events.id or feed_events.id). */
  id: string
  title: string
  start: Date
  /** Exclusive for all-day items, like iCalendar. */
  end: Date
  allDay: boolean
  /** A CSS color: a hex value or a design token such as `var(--guest)`. */
  color: string
  /** The owner's profile id; null means household. */
  ownerId: string | null
  editable: boolean
  kind: ItemKind
}

export type EventItem = ItemBase & {
  source: 'event'
  kind: 'event'
  editable: true
  feedId?: undefined
  feedKind?: undefined
  raw: EventRow
}

export type FeedItem = ItemBase & {
  source: 'feed'
  kind: 'personal' | 'stay' | 'blocked'
  editable: false
  feedId: string
  feedKind: 'airbnb' | 'ical'
  feed: FeedMeta
  /** Set when kind is 'stay'. */
  stay?: GuestStay
  raw: FeedEventRow
}

export type CalendarItem = EventItem | FeedItem

export type GuestStay = {
  id: string
  checkIn: Date
  checkOut: Date
  nights: number
  reservationUrl?: string
  phoneLast4?: string
  feedName: string
}
