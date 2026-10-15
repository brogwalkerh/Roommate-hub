import { compareTimestamps, isNewer } from './timestamps'

describe('compareTimestamps', () => {
  it('orders by instant', () => {
    expect(compareTimestamps('2026-10-15T10:00:00+00:00', '2026-10-15T10:00:01+00:00')).toBeLessThan(0)
    expect(compareTimestamps('2026-10-15T10:00:01Z', '2026-10-15T10:00:00Z')).toBeGreaterThan(0)
  })

  it('keeps microsecond precision', () => {
    expect(compareTimestamps('2026-10-15T10:00:00.123456+00:00', '2026-10-15T10:00:00.123457+00:00')).toBeLessThan(0)
    expect(compareTimestamps('2026-10-15T10:00:00.123457+00:00', '2026-10-15T10:00:00.123456+00:00')).toBeGreaterThan(0)
  })

  it('treats trimmed trailing zeros as the same value', () => {
    expect(compareTimestamps('2026-10-15T10:00:00.5+00:00', '2026-10-15T10:00:00.500000+00:00')).toBe(0)
    expect(compareTimestamps('2026-10-15T10:00:00+00:00', '2026-10-15T10:00:00.000000+00:00')).toBe(0)
  })

  it('compares fractions numerically, not as text', () => {
    expect(compareTimestamps('2026-10-15T10:00:00.12+00:00', '2026-10-15T10:00:00.123456+00:00')).toBeLessThan(0)
    expect(compareTimestamps('2026-10-15T10:00:00.9+00:00', '2026-10-15T10:00:00.12+00:00')).toBeGreaterThan(0)
  })

  it('handles different offsets and formats', () => {
    expect(compareTimestamps('2026-10-15T12:00:00+02:00', '2026-10-15T10:00:00Z')).toBe(0)
    expect(compareTimestamps('2026-10-15 10:00:00+00', '2026-10-15T10:00:00Z')).toBe(0)
    expect(compareTimestamps('2026-10-15T10:00:00-0700', '2026-10-15T17:00:00Z')).toBe(0)
  })

  it('falls back to text order for values it cannot parse', () => {
    expect(compareTimestamps('a', 'b')).toBeLessThan(0)
    expect(compareTimestamps('b', 'a')).toBeGreaterThan(0)
    expect(compareTimestamps('same', 'same')).toBe(0)
  })
})

describe('isNewer', () => {
  it('is strict', () => {
    expect(isNewer('2026-10-15T10:00:00.000002+00:00', '2026-10-15T10:00:00.000001+00:00')).toBe(true)
    expect(isNewer('2026-10-15T10:00:00.000001+00:00', '2026-10-15T10:00:00.000001+00:00')).toBe(false)
    expect(isNewer('2026-10-15T09:59:59+00:00', '2026-10-15T10:00:00+00:00')).toBe(false)
  })
})
