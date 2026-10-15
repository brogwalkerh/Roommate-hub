import { fetchWindow, overlapFilter, toDayWindow } from './range'
import { initialFetchWindow, initialVisibleRange } from './views'

describe('toDayWindow', () => {
  it('snaps a range outward to whole local days', () => {
    const win = toDayWindow({ start: new Date(2026, 9, 15, 13, 45), end: new Date(2026, 9, 17, 8, 0) })
    expect(win.start).toEqual(new Date(2026, 9, 15))
    expect(win.end).toEqual(new Date(2026, 9, 18))
    expect(win.startDate).toBe('2026-10-15')
    expect(win.endDate).toBe('2026-10-18')
  })

  it('keeps a range that already ends at midnight', () => {
    const win = toDayWindow({ start: new Date(2026, 9, 15), end: new Date(2026, 9, 17) })
    expect(win.end).toEqual(new Date(2026, 9, 17))
    expect(win.endDate).toBe('2026-10-17')
  })

  it('gives the same window for ranges built from different moments of the same days', () => {
    const a = toDayWindow({ start: new Date(2026, 9, 15, 1, 0, 0, 1), end: new Date(2026, 9, 20, 23, 59) })
    const b = toDayWindow({ start: new Date(2026, 9, 15, 23, 0), end: new Date(2026, 9, 20, 0, 1) })
    expect(a.startIso).toBe(b.startIso)
    expect(a.endIso).toBe(b.endIso)
  })

  it('covers at least one day for an empty or backwards range', () => {
    const day = new Date(2026, 9, 15, 12)
    expect(toDayWindow({ start: day, end: day }).endDate).toBe('2026-10-16')
    expect(toDayWindow({ start: day, end: new Date(2026, 9, 1) }).endDate).toBe('2026-10-16')
  })

  it('gives ISO timestamps for the timed-event filter', () => {
    const win = toDayWindow({ start: new Date(2026, 9, 15), end: new Date(2026, 9, 16) })
    expect(win.startIso).toBe(new Date(2026, 9, 15).toISOString())
    expect(win.endIso).toBe(new Date(2026, 9, 16).toISOString())
  })
})

describe('fetchWindow', () => {
  it('covers the whole month of a week view inside one month', () => {
    const win = fetchWindow(new Date(2026, 9, 11), new Date(2026, 9, 18))
    expect(win).toEqual({ start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) })
  })

  it('covers both months of a view that crosses a month end', () => {
    const win = fetchWindow(new Date(2026, 9, 25), new Date(2026, 10, 1, 0, 0, 0, 1))
    expect(win).toEqual({ start: new Date(2026, 9, 1), end: new Date(2026, 11, 1) })
  })

  it('does not reach into the next month when the view ends exactly at midnight on the 1st', () => {
    const win = fetchWindow(new Date(2026, 9, 25), new Date(2026, 10, 1))
    expect(win.end).toEqual(new Date(2026, 10, 1))
  })

  it('covers the leading and trailing days of a month grid', () => {
    const win = fetchWindow(new Date(2026, 8, 27), new Date(2026, 10, 8))
    expect(win).toEqual({ start: new Date(2026, 8, 1), end: new Date(2026, 11, 1) })
  })

  it('stays the same while paging inside a month, so no refetch', () => {
    const first = fetchWindow(new Date(2026, 9, 4), new Date(2026, 9, 11))
    const second = fetchWindow(new Date(2026, 9, 18), new Date(2026, 9, 25))
    expect(second).toEqual(first)
  })

  it('crosses a year end', () => {
    const win = fetchWindow(new Date(2026, 11, 27), new Date(2027, 0, 3))
    expect(win).toEqual({ start: new Date(2026, 11, 1), end: new Date(2027, 1, 1) })
  })
})

describe('initial ranges', () => {
  const today = new Date(2026, 9, 15, 14, 30)

  it('starts the agenda today and runs two weeks', () => {
    expect(initialVisibleRange('agenda', today)).toEqual({ start: new Date(2026, 9, 15), end: new Date(2026, 9, 29) })
  })

  it('shows the Sunday-to-Saturday week', () => {
    expect(initialVisibleRange('week', today)).toEqual({ start: new Date(2026, 9, 11), end: new Date(2026, 9, 18) })
  })

  it('shows the month grid with its leading and trailing days', () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    expect(initialVisibleRange('month', today)).toEqual({ start: new Date(2026, 8, 27), end: new Date(2026, 10, 1) })
  })

  it('loads whole months around the visible days', () => {
    expect(initialFetchWindow('agenda', today)).toEqual({ start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) })
    expect(initialFetchWindow('month', today)).toEqual({ start: new Date(2026, 8, 1), end: new Date(2026, 10, 1) })
  })
})

describe('overlapFilter', () => {
  const win = toDayWindow({ start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) })
  const filter = overlapFilter(win)

  it('matches timed rows that start before the end and finish after the start', () => {
    expect(filter).toContain(`and(all_day.eq.false,starts_at.lt.${win.endIso},`)
    expect(filter).toContain(`ends_at.gte.${win.startIso}`)
  })

  it('matches all-day rows by date, treating end_date as exclusive', () => {
    expect(filter).toContain('and(all_day.eq.true,start_date.lt.2026-11-01,')
    expect(filter).toContain('end_date.gt.2026-10-01')
  })

  it('keeps rows with no end that start inside the window', () => {
    expect(filter).toContain(`and(ends_at.is.null,starts_at.gte.${win.startIso})`)
    expect(filter).toContain('and(end_date.is.null,start_date.gte.2026-10-01)')
  })

  it('has balanced parentheses and no stray spaces, so PostgREST can parse it', () => {
    expect(filter.split('(').length).toBe(filter.split(')').length)
    expect(filter).not.toMatch(/\s/)
  })
})
