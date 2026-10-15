import { relativeTime } from './relativeTime'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('relativeTime', () => {
  it('says "just now" for the first moments, and for clocks that run ahead', () => {
    expect(relativeTime('2026-10-15T11:59:30.123456+00:00')).toBe('just now')
    expect(relativeTime('2026-10-15T12:00:05+00:00')).toBe('just now')
  })

  it('counts minutes, hours and days', () => {
    expect(relativeTime('2026-10-15T11:57:00+00:00')).toBe('3 minutes ago')
    expect(relativeTime('2026-10-15T09:00:00.5+00:00')).toBe('3 hours ago')
    expect(relativeTime('2026-10-13T12:00:00+00:00')).toBe('2 days ago')
  })

  it('reads timestamps with an offset', () => {
    expect(relativeTime('2026-10-15T13:57:00+02:00')).toBe('3 minutes ago')
  })

  it('returns an empty string for garbage', () => {
    expect(relativeTime('not a date')).toBe('')
  })
})
