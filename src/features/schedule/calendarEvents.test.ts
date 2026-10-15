import { toCalendarEvent } from './calendarEvents'
import { eventRowToItem, feedRowToItem } from './items'
import type { EventRow, FeedEventWithFeed, FeedMeta } from './types'

const baseRow: EventRow = {
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
}

const airbnb: FeedMeta = {
  id: 'a1',
  name: 'Beach house',
  kind: 'airbnb',
  color: '#d9534f',
  owner_id: null,
  privacy: 'details',
  url_hint: null,
  last_synced_at: null,
  last_error: null,
}

function stayRow(summary: string): FeedEventWithFeed {
  return {
    id: 'fe1',
    feed_id: 'a1',
    uid: 'u',
    recurrence_id: '',
    summary,
    description: null,
    location: null,
    url: null,
    all_day: true,
    starts_at: null,
    ends_at: null,
    start_date: '2026-10-17',
    end_date: '2026-10-20',
    calendar_feeds: airbnb,
  }
}

describe('toCalendarEvent', () => {
  it('passes a timed event through as dates and makes it editable', () => {
    const item = eventRowToItem(baseRow, [{ id: 'me', color: '#2c5ea6' }])
    if (!item) throw new Error('bad fixture')
    expect(toCalendarEvent(item)).toMatchObject({
      id: 'e1',
      title: 'Dentist',
      allDay: false,
      start: new Date(2026, 9, 15, 9, 0),
      end: new Date(2026, 9, 15, 10, 0),
      color: '#2c5ea6',
      editable: true,
      className: 'sched-ev sched-ev--event',
    })
  })

  it('passes an all-day event as date strings with the exclusive end', () => {
    const item = eventRowToItem({ ...baseRow, all_day: true, starts_at: null, ends_at: null, start_date: '2026-10-15', end_date: '2026-10-17' }, [])
    if (!item) throw new Error('bad fixture')
    expect(toCalendarEvent(item)).toMatchObject({ allDay: true, start: '2026-10-15', end: '2026-10-17', color: 'var(--accent)' })
  })

  it('makes feed events read-only', () => {
    const item = feedRowToItem(stayRow('Reserved'))
    if (!item) throw new Error('bad fixture')
    expect(toCalendarEvent(item)).toMatchObject({
      editable: false,
      title: 'Guest stay',
      color: 'var(--guest)',
      className: 'sched-ev sched-ev--stay',
    })
  })

  it('marks blocked dates so they can be styled quietly', () => {
    const item = feedRowToItem(stayRow('Airbnb (Not available)'))
    if (!item) throw new Error('bad fixture')
    expect(toCalendarEvent(item)).toMatchObject({ className: 'sched-ev sched-ev--blocked', contrastColor: 'var(--muted)' })
  })
})
