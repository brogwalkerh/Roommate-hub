import { compactTime, DEFAULT_DISPLAY, eventLabel, getDisplayPrefs, initialOf, setDisplayPrefs } from './display'

const item = (o: Partial<Parameters<typeof eventLabel>[0]> = {}) => ({
  title: 'Work',
  kind: 'event' as const,
  allDay: false,
  start: new Date(2026, 9, 21, 6, 0),
  end: new Date(2026, 9, 21, 14, 30),
  ...o,
})

describe('compactTime', () => {
  it.each([
    [new Date(2026, 0, 1, 6, 0), '6'],
    [new Date(2026, 0, 1, 14, 30), '230'],
    [new Date(2026, 0, 1, 11, 15), '1115'],
    [new Date(2026, 0, 1, 0, 0), '12'],
    [new Date(2026, 0, 1, 12, 5), '1205'],
  ])('%s -> %s', (d, text) => {
    expect(compactTime(d)).toBe(text)
  })
})

describe('initialOf', () => {
  it('takes the first letter', () => {
    expect(initialOf('collin')).toBe('C')
    expect(initialOf('  Brogden W')).toBe('B')
    expect(initialOf('')).toBeNull()
    expect(initialOf(null)).toBeNull()
  })
})

describe('eventLabel', () => {
  it('keeps the name by default', () => {
    expect(eventLabel(item(), 'title', 'C')).toBe('Work')
  })

  it('puts the initial before the name', () => {
    expect(eventLabel(item(), 'initial', 'C')).toBe('C Work')
    expect(eventLabel(item(), 'initial', null)).toBe('Work')
  })

  it('shows initial and times in compact mode', () => {
    expect(eventLabel(item(), 'compact', 'C')).toBe('C 6-230')
    expect(eventLabel(item(), 'compact', null)).toBe('6-230')
    expect(eventLabel(item({ end: new Date(2026, 9, 21, 6, 0) }), 'compact', 'C')).toBe('C 6')
    expect(eventLabel(item({ start: new Date(2026, 9, 21, 22, 0), end: new Date(2026, 9, 22, 6, 0) }), 'compact', 'B')).toBe('B 10-6')
  })

  it('keeps names for all-day items, guest stays and blocked dates', () => {
    expect(eventLabel(item({ title: 'Day off', allDay: true }), 'compact', 'C')).toBe('C Day off')
    expect(eventLabel(item({ title: 'Guest stay', kind: 'stay' }), 'compact', null)).toBe('Guest stay')
    expect(eventLabel(item({ title: 'Blocked', kind: 'blocked' }), 'initial', 'C')).toBe('Blocked')
  })
})

describe('display preferences', () => {
  it('start at the defaults, change, and survive a reload', () => {
    localStorage.clear()
    setDisplayPrefs({ ...DEFAULT_DISPLAY })
    expect(getDisplayPrefs()).toEqual(DEFAULT_DISPLAY)
    setDisplayPrefs({ label: 'compact', dense: true })
    expect(getDisplayPrefs()).toEqual({ bold: true, label: 'compact', dense: true })
    expect(JSON.parse(localStorage.getItem('roommate-hub:calendar-display')!)).toEqual({ bold: true, label: 'compact', dense: true })
  })
})
