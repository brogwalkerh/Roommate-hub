import {
  addDaysToDateString,
  allDayFromInputs,
  allDayToInputs,
  calendarTimesToFields,
  timedFromInputs,
  timedToInputs,
  validateRange,
} from './eventTime'

describe('all-day dates', () => {
  it('shows the inclusive last day for an exclusive database end', () => {
    expect(allDayToInputs('2026-10-15', '2026-10-16')).toEqual({ start: '2026-10-15', end: '2026-10-15' })
    expect(allDayToInputs('2026-10-15', '2026-10-18')).toEqual({ start: '2026-10-15', end: '2026-10-17' })
  })

  it('stores the day after the inclusive end', () => {
    expect(allDayFromInputs('2026-10-15', '2026-10-15')).toEqual({ start_date: '2026-10-15', end_date: '2026-10-16' })
    expect(allDayFromInputs('2026-10-15', '2026-10-17')).toEqual({ start_date: '2026-10-15', end_date: '2026-10-18' })
  })

  it('round-trips through the form', () => {
    const stored = { start_date: '2026-10-30', end_date: '2026-11-02' }
    const form = allDayToInputs(stored.start_date, stored.end_date)
    expect(allDayFromInputs(form.start, form.end)).toEqual(stored)
  })

  it('carries across month, year and leap-day ends', () => {
    expect(allDayFromInputs('2026-12-31', '2026-12-31').end_date).toBe('2027-01-01')
    expect(allDayFromInputs('2028-02-28', '2028-02-29').end_date).toBe('2028-03-01')
    expect(allDayToInputs('2026-12-30', '2027-01-01').end).toBe('2026-12-31')
  })

  it('never shows an end before the start', () => {
    expect(allDayToInputs('2026-10-15', '2026-10-15').end).toBe('2026-10-15')
  })

  it('adds and subtracts whole days from a date string', () => {
    expect(addDaysToDateString('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDaysToDateString('2026-11-01', 1)).toBe('2026-11-02')
    expect(addDaysToDateString('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('timed events', () => {
  it('shows stored timestamps in local time for datetime-local inputs', () => {
    const start = new Date(2026, 9, 15, 9, 30)
    const end = new Date(2026, 9, 15, 11, 0)
    expect(timedToInputs(start.toISOString(), end.toISOString())).toEqual({
      start: '2026-10-15T09:30',
      end: '2026-10-15T11:00',
    })
  })

  it('stores local input values as ISO timestamps', () => {
    expect(timedFromInputs('2026-10-15T09:30', '2026-10-15T11:00')).toEqual({
      starts_at: new Date(2026, 9, 15, 9, 30).toISOString(),
      ends_at: new Date(2026, 9, 15, 11, 0).toISOString(),
    })
  })

  it('round-trips minute-precision values', () => {
    const { starts_at, ends_at } = timedFromInputs('2026-12-31T23:45', '2027-01-01T00:15')
    expect(timedToInputs(starts_at, ends_at)).toEqual({ start: '2026-12-31T23:45', end: '2027-01-01T00:15' })
  })
})

describe('validateRange', () => {
  it('accepts an end after the start', () => {
    expect(validateRange(false, '2026-10-15T09:00', '2026-10-15T10:00')).toBeNull()
    expect(validateRange(true, '2026-10-15', '2026-10-17')).toBeNull()
  })

  it('accepts an end equal to the start', () => {
    expect(validateRange(false, '2026-10-15T09:00', '2026-10-15T09:00')).toBeNull()
    expect(validateRange(true, '2026-10-15', '2026-10-15')).toBeNull()
  })

  it('rejects an end before the start', () => {
    expect(validateRange(false, '2026-10-15T09:00', '2026-10-15T08:59')).toMatch(/before the start/)
    expect(validateRange(true, '2026-10-15', '2026-10-14')).toMatch(/before the start/)
  })

  it('rejects an end on an earlier day even when its clock time is later', () => {
    expect(validateRange(false, '2026-10-16T09:00', '2026-10-15T23:00')).not.toBeNull()
  })

  it('asks for dates that are missing or malformed', () => {
    expect(validateRange(true, '', '2026-10-15')).toMatch(/Pick a start and end date/)
    expect(validateRange(false, '2026-10-15T09:00', '')).toMatch(/Pick a start and end time/)
    expect(validateRange(true, '2026-13-45', '2026-10-15')).toMatch(/Pick a start/)
    expect(validateRange(false, '2026-10-15', '2026-10-15T10:00')).toMatch(/Pick a start/)
  })
})

describe('calendarTimesToFields', () => {
  it('converts an all-day drop, keeping FullCalendar’s exclusive end', () => {
    expect(calendarTimesToFields({ start: new Date(2026, 9, 15), end: new Date(2026, 9, 17), allDay: true })).toEqual({
      all_day: true,
      starts_at: null,
      ends_at: null,
      start_date: '2026-10-15',
      end_date: '2026-10-17',
    })
  })

  it('gives a one-day all-day event with no end a one-day span', () => {
    const fields = calendarTimesToFields({ start: new Date(2026, 9, 15), end: null, allDay: true })
    expect(fields.start_date).toBe('2026-10-15')
    expect(fields.end_date).toBe('2026-10-16')
  })

  it('never stores an all-day end on or before its start', () => {
    const fields = calendarTimesToFields({ start: new Date(2026, 9, 15), end: new Date(2026, 9, 15), allDay: true })
    expect(fields.end_date).toBe('2026-10-16')
  })

  it('converts a timed drop to timestamps and clears the date columns', () => {
    const start = new Date(2026, 9, 15, 14, 0)
    const end = new Date(2026, 9, 15, 15, 30)
    expect(calendarTimesToFields({ start, end, allDay: false })).toEqual({
      all_day: false,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      start_date: null,
      end_date: null,
    })
  })

  it('uses the fallback length when a timed event has no end', () => {
    const start = new Date(2026, 9, 15, 14, 0)
    expect(calendarTimesToFields({ start, end: null, allDay: false }, 30 * 60 * 1000).ends_at).toBe(
      new Date(2026, 9, 15, 14, 30).toISOString(),
    )
    expect(calendarTimesToFields({ start, end: null, allDay: false }).ends_at).toBe(new Date(2026, 9, 15, 15, 0).toISOString())
  })
})
