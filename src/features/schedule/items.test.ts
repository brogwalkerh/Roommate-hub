import {
  BLOCKED_COLOR,
  buildCalendarItems,
  buildGuestStays,
  eventRowToItem,
  feedRowToItem,
  GUEST_COLOR,
  HOUSEHOLD_COLOR,
  rowTimes,
} from './items'
import type { EventRow, FeedEventWithFeed, FeedMeta } from './types'

const ME = { id: 'me', color: '#2c5ea6' }
const ROOMMATE = { id: 'rm', color: '#b0452f' }
const MEMBERS = [ME, ROOMMATE]
const RESERVATION = 'https://www.airbnb.com/hosting/reservations/details/HMABC12345'

function eventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1',
    title: 'Dentist',
    notes: null,
    location: null,
    owner_id: 'me',
    all_day: false,
    starts_at: new Date(2026, 9, 15, 9, 0).toISOString(),
    ends_at: new Date(2026, 9, 15, 10, 0).toISOString(),
    start_date: null,
    end_date: null,
    created_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

const airbnbFeed: FeedMeta = {
  id: 'f-airbnb',
  name: 'Beach house',
  kind: 'airbnb',
  color: '#d9534f',
  owner_id: null,
  privacy: 'details',
  url_hint: 'airbnb.com ...abcd',
  last_synced_at: '2026-10-14T10:00:00Z',
  last_error: null,
}

const personalFeed: FeedMeta = {
  id: 'f-alex',
  name: 'Alex work',
  kind: 'ical',
  color: '#7a4fa3',
  owner_id: 'rm',
  privacy: 'details',
  url_hint: 'calendar.google.com ...ics',
  last_synced_at: null,
  last_error: null,
}

function feedRow(feed: FeedMeta | null, overrides: Partial<FeedEventWithFeed> = {}): FeedEventWithFeed {
  return {
    id: 'fe1',
    feed_id: feed?.id ?? 'missing',
    uid: 'uid-1',
    recurrence_id: '',
    summary: 'Reserved',
    description: `Reservation URL: ${RESERVATION}\nPhone Number (Last 4 Digits): 1234`,
    location: null,
    url: null,
    all_day: true,
    starts_at: null,
    ends_at: null,
    start_date: '2026-10-17',
    end_date: '2026-10-20',
    calendar_feeds: feed,
    ...overrides,
  }
}

describe('rowTimes', () => {
  it('reads all-day rows as local midnights with an exclusive end', () => {
    const times = rowTimes(eventRow({ all_day: true, start_date: '2026-10-15', end_date: '2026-10-17', starts_at: null, ends_at: null }))
    expect(times).toEqual({ start: new Date(2026, 9, 15), end: new Date(2026, 9, 17), allDay: true })
  })

  it('reads timed rows from their timestamps', () => {
    const times = rowTimes(eventRow())
    expect(times).toEqual({ start: new Date(2026, 9, 15, 9, 0), end: new Date(2026, 9, 15, 10, 0), allDay: false })
  })

  it('gives an all-day row without a usable end a one-day span', () => {
    expect(rowTimes(eventRow({ all_day: true, start_date: '2026-10-15', end_date: null, starts_at: null, ends_at: null }))?.end).toEqual(
      new Date(2026, 9, 16),
    )
    expect(
      rowTimes(eventRow({ all_day: true, start_date: '2026-10-15', end_date: '2026-10-15', starts_at: null, ends_at: null }))?.end,
    ).toEqual(new Date(2026, 9, 16))
  })

  it('ends a timed row without an end at its start', () => {
    const times = rowTimes(eventRow({ ends_at: null }))
    expect(times?.end).toEqual(times?.start)
  })

  it('skips rows with no start or an unreadable one', () => {
    expect(rowTimes(eventRow({ starts_at: null }))).toBeNull()
    expect(rowTimes(eventRow({ all_day: true, start_date: null }))).toBeNull()
    expect(rowTimes(eventRow({ starts_at: 'not a date' }))).toBeNull()
  })
})

describe('eventRowToItem', () => {
  it('colors an event with its owner’s profile color', () => {
    expect(eventRowToItem(eventRow({ owner_id: 'rm' }), MEMBERS)).toMatchObject({
      source: 'event',
      kind: 'event',
      color: ROOMMATE.color,
      ownerId: 'rm',
      editable: true,
      title: 'Dentist',
    })
  })

  it('colors a household event with the accent token', () => {
    expect(eventRowToItem(eventRow({ owner_id: null }), MEMBERS)).toMatchObject({ color: HOUSEHOLD_COLOR, ownerId: null })
  })

  it('falls back to the accent token while profiles are loading', () => {
    expect(eventRowToItem(eventRow({ owner_id: 'me' }), [])?.color).toBe(HOUSEHOLD_COLOR)
  })

  it('keeps the database row', () => {
    const row = eventRow()
    expect(eventRowToItem(row, MEMBERS)?.raw).toBe(row)
  })

  it('returns null for a row with no usable times', () => {
    expect(eventRowToItem(eventRow({ starts_at: null }), MEMBERS)).toBeNull()
  })
})

describe('feedRowToItem', () => {
  it('shows an Airbnb "Reserved" row as a guest stay in the guest color', () => {
    const item = feedRowToItem(feedRow(airbnbFeed))
    expect(item).toMatchObject({
      source: 'feed',
      kind: 'stay',
      title: 'Guest stay',
      color: GUEST_COLOR,
      allDay: true,
      editable: false,
      feedId: 'f-airbnb',
      feedKind: 'airbnb',
      ownerId: null,
    })
    expect(item?.start).toEqual(new Date(2026, 9, 17))
    expect(item?.end).toEqual(new Date(2026, 9, 20))
    expect(item?.stay).toEqual({
      id: 'fe1',
      checkIn: new Date(2026, 9, 17),
      checkOut: new Date(2026, 9, 20),
      nights: 3,
      reservationUrl: RESERVATION,
      phoneLast4: '1234',
      feedName: 'Beach house',
    })
  })

  it('shows any other Airbnb summary as blocked dates', () => {
    for (const summary of ['Airbnb (Not available)', 'Not available', '', null]) {
      expect(feedRowToItem(feedRow(airbnbFeed, { summary, description: null }))).toMatchObject({
        kind: 'blocked',
        title: 'Blocked',
        color: BLOCKED_COLOR,
        editable: false,
      })
    }
    expect(feedRowToItem(feedRow(airbnbFeed, { summary: 'Airbnb (Not available)' }))?.stay).toBeUndefined()
  })

  it('leaves out the stay’s optional details when the description has none', () => {
    const stay = feedRowToItem(feedRow(airbnbFeed, { description: null }))?.stay
    expect(stay).toBeDefined()
    expect(stay).not.toHaveProperty('reservationUrl')
    expect(stay).not.toHaveProperty('phoneLast4')
  })

  it('falls back to the event URL for the reservation link, but only if it is http(s)', () => {
    expect(feedRowToItem(feedRow(airbnbFeed, { description: null, url: RESERVATION }))?.stay?.reservationUrl).toBe(RESERVATION)
    expect(feedRowToItem(feedRow(airbnbFeed, { description: null, url: 'javascript:alert(1)' }))?.stay).not.toHaveProperty('reservationUrl')
  })

  it('shows a personal calendar event with the feed color and its owner', () => {
    const row = feedRow(personalFeed, {
      summary: 'Team sync',
      description: 'Weekly',
      all_day: false,
      start_date: null,
      end_date: null,
      starts_at: new Date(2026, 9, 15, 13, 0).toISOString(),
      ends_at: new Date(2026, 9, 15, 14, 0).toISOString(),
    })
    expect(feedRowToItem(row)).toMatchObject({
      kind: 'personal',
      title: 'Team sync',
      color: '#7a4fa3',
      ownerId: 'rm',
      allDay: false,
      editable: false,
      feedKind: 'ical',
    })
  })

  it('shows "Busy" for a busy-only feed whatever the row says', () => {
    const busyFeed = { ...personalFeed, privacy: 'busy' as const }
    expect(feedRowToItem(feedRow(busyFeed, { summary: 'Secret therapy' }))?.title).toBe('Busy')
    expect(feedRowToItem(feedRow(busyFeed, { summary: 'Busy' }))?.title).toBe('Busy')
  })

  it('names an untitled personal event', () => {
    expect(feedRowToItem(feedRow(personalFeed, { summary: '  ' }))?.title).toBe('Untitled event')
    expect(feedRowToItem(feedRow(personalFeed, { summary: null }))?.title).toBe('Untitled event')
  })

  it('skips rows without feed metadata or usable dates', () => {
    expect(feedRowToItem(feedRow(null))).toBeNull()
    expect(feedRowToItem(feedRow(airbnbFeed, { start_date: null }))).toBeNull()
  })
})

describe('buildCalendarItems', () => {
  it('merges events and feed rows, sorted by start', () => {
    const items = buildCalendarItems({
      events: [
        eventRow({ id: 'late', title: 'Late', starts_at: new Date(2026, 9, 18, 9, 0).toISOString(), ends_at: new Date(2026, 9, 18, 10, 0).toISOString() }),
        eventRow({ id: 'early', title: 'Early' }),
      ],
      feedEvents: [feedRow(airbnbFeed, { id: 'stay' })],
      members: MEMBERS,
    })
    expect(items.map((i) => i.id)).toEqual(['early', 'stay', 'late'])
  })

  it('puts all-day items before timed ones that start the same day', () => {
    const items = buildCalendarItems({
      events: [eventRow({ id: 'timed', starts_at: new Date(2026, 9, 17, 0, 0).toISOString(), ends_at: new Date(2026, 9, 17, 1, 0).toISOString() })],
      feedEvents: [feedRow(airbnbFeed, { id: 'stay' })],
      members: MEMBERS,
    })
    expect(items.map((i) => i.id)).toEqual(['stay', 'timed'])
  })

  it('drops rows it cannot place', () => {
    const items = buildCalendarItems({
      events: [eventRow({ starts_at: null }), eventRow({ id: 'ok' })],
      feedEvents: [feedRow(null)],
      members: MEMBERS,
    })
    expect(items.map((i) => i.id)).toEqual(['ok'])
  })

  it('returns an empty list for no rows', () => {
    expect(buildCalendarItems({ events: [], feedEvents: [], members: [] })).toEqual([])
  })
})

describe('buildGuestStays', () => {
  it('lists only Airbnb bookings, soonest check-in first', () => {
    const stays = buildGuestStays([
      feedRow(airbnbFeed, { id: 'later', start_date: '2026-11-02', end_date: '2026-11-05' }),
      feedRow(airbnbFeed, { id: 'blocked', summary: 'Airbnb (Not available)' }),
      feedRow(personalFeed, { id: 'personal', summary: 'Reserved' }),
      feedRow(airbnbFeed, { id: 'sooner' }),
      feedRow(null, { id: 'orphan' }),
    ])
    expect(stays.map((s) => s.id)).toEqual(['sooner', 'later'])
    expect(stays[0]).toMatchObject({ nights: 3, feedName: 'Beach house', phoneLast4: '1234', reservationUrl: RESERVATION })
    expect(stays[1]?.nights).toBe(3)
  })

  it('counts nights across a month end', () => {
    const [stay] = buildGuestStays([feedRow(airbnbFeed, { start_date: '2026-10-30', end_date: '2026-11-02' })])
    expect(stay?.nights).toBe(3)
  })
})
