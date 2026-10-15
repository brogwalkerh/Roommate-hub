import { afterEach } from 'vitest'
import { DEFAULT_HIDDEN, feedFilterKey, filterKeyFor, isItemVisible, loadHidden, saveHidden, toggleHidden } from './filters'
import { eventRowToItem, feedRowToItem } from './items'
import type { CalendarItem, EventRow, FeedEventWithFeed, FeedMeta } from './types'

const STORAGE_KEY = 'roommate-hub:schedule-filters'

function eventItem(ownerId: string | null): CalendarItem {
  const row: EventRow = {
    id: `e-${ownerId ?? 'household'}`,
    title: 'Thing',
    notes: null,
    location: null,
    owner_id: ownerId,
    all_day: true,
    starts_at: null,
    ends_at: null,
    start_date: '2026-10-15',
    end_date: '2026-10-16',
    created_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  }
  const item = eventRowToItem(row, [])
  if (!item) throw new Error('bad fixture')
  return item
}

function feedItem(feed: FeedMeta, summary: string): CalendarItem {
  const row: FeedEventWithFeed = {
    id: `fe-${feed.id}-${summary}`,
    feed_id: feed.id,
    uid: 'u',
    recurrence_id: '',
    summary,
    description: null,
    location: null,
    url: null,
    all_day: true,
    starts_at: null,
    ends_at: null,
    start_date: '2026-10-15',
    end_date: '2026-10-16',
    calendar_feeds: feed,
  }
  const item = feedRowToItem(row)
  if (!item) throw new Error('bad fixture')
  return item
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
const personal: FeedMeta = { ...airbnb, id: 'p1', name: 'Alex work', kind: 'ical' }

describe('filterKeyFor', () => {
  it('sorts native events by owner', () => {
    expect(filterKeyFor(eventItem('me'), 'me')).toBe('me')
    expect(filterKeyFor(eventItem('rm'), 'me')).toBe('roommate')
    expect(filterKeyFor(eventItem(null), 'me')).toBe('household')
  })

  it('sorts Airbnb rows into stays and blocked dates', () => {
    expect(filterKeyFor(feedItem(airbnb, 'Reserved'), 'me')).toBe('stays')
    expect(filterKeyFor(feedItem(airbnb, 'Airbnb (Not available)'), 'me')).toBe('blocked')
  })

  it('gives each personal feed its own key', () => {
    expect(filterKeyFor(feedItem(personal, 'Standup'), 'me')).toBe(feedFilterKey('p1'))
    expect(feedFilterKey('p1')).toBe('feed:p1')
  })
})

describe('isItemVisible', () => {
  it('hides items whose chip is off', () => {
    expect(isItemVisible(eventItem('rm'), ['roommate'], 'me')).toBe(false)
    expect(isItemVisible(eventItem('me'), ['roommate'], 'me')).toBe(true)
    expect(isItemVisible(feedItem(airbnb, 'Airbnb (Not available)'), ['blocked'], 'me')).toBe(false)
    expect(isItemVisible(feedItem(personal, 'Standup'), ['feed:p1'], 'me')).toBe(false)
  })

  it('shows everything when no chip is off', () => {
    for (const item of [eventItem('me'), eventItem(null), feedItem(airbnb, 'Reserved'), feedItem(personal, 'Standup')]) {
      expect(isItemVisible(item, [], 'me')).toBe(true)
    }
  })

  it('hides blocked dates by default', () => {
    expect(isItemVisible(feedItem(airbnb, 'Airbnb (Not available)'), DEFAULT_HIDDEN, 'me')).toBe(false)
    expect(isItemVisible(feedItem(airbnb, 'Reserved'), DEFAULT_HIDDEN, 'me')).toBe(true)
  })
})

describe('toggleHidden', () => {
  it('switches a chip off and back on without changing the original list', () => {
    const start = ['blocked']
    const off = toggleHidden(start, 'me')
    expect(off).toEqual(['blocked', 'me'])
    expect(toggleHidden(off, 'me')).toEqual(['blocked'])
    expect(start).toEqual(['blocked'])
  })
})

describe('remembered filters', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('starts with the defaults when nothing is stored', () => {
    expect(loadHidden()).toEqual(['blocked'])
  })

  it('saves and loads the hidden chips', () => {
    saveHidden(['me', 'feed:p1'])
    expect(loadHidden()).toEqual(['me', 'feed:p1'])
  })

  it('remembers that blocked dates were switched on', () => {
    saveHidden([])
    expect(loadHidden()).toEqual([])
  })

  it('does not change the shared default list', () => {
    const loaded = loadHidden()
    loaded.push('me')
    expect(DEFAULT_HIDDEN).toEqual(['blocked'])
  })

  it.each(['not json', '{"hidden": "me"}', '{"hidden": [1, 2]}', '[]', 'null', '{}'])('falls back to defaults for stored %j', (stored) => {
    localStorage.setItem(STORAGE_KEY, stored)
    expect(loadHidden()).toEqual(['blocked'])
  })

  it('falls back to defaults when storage can’t be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadHidden()).toEqual(['blocked'])
  })

  it('does not throw when storage can’t be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveHidden(['me'])).not.toThrow()
  })
})
