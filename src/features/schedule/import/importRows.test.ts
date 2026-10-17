import { parsedRange, rowProblem, rowsFromParsed, rowToFields, timedRange, type ImportRow, type ParsedEvent } from './importRows'

const parsed = (o: Partial<ParsedEvent> = {}): ParsedEvent => ({
  title: 'Work',
  date: '2026-10-20',
  endDate: '2026-10-20',
  allDay: false,
  startTime: '09:00',
  endTime: '17:00',
  location: 'Café Rio',
  notes: '',
  ...o,
})

const local = (value: string) => new Date(value).toISOString()

describe('timedRange', () => {
  it('uses the given end time', () => {
    expect(timedRange({ startDay: '2026-10-20', startTime: '09:00', endTime: '17:00' })).toEqual({
      start: '2026-10-20T09:00',
      end: '2026-10-20T17:00',
    })
  })

  it('ends an overnight shift the next day', () => {
    expect(timedRange({ startDay: '2026-10-31', startTime: '22:00', endTime: '06:00' }).end).toBe('2026-11-01T06:00')
  })

  it('lasts an hour when there is no end time', () => {
    expect(timedRange({ startDay: '2026-10-20', startTime: '23:30', endTime: '' }).end).toBe('2026-10-21T00:30')
  })
})

describe('rowsFromParsed', () => {
  it('makes one ticked row per event', () => {
    const rows = rowsFromParsed([parsed(), parsed({ title: 'Leave', allDay: true, startTime: '', endTime: '', endDate: '2026-10-23' })], [])
    expect(rows).toEqual([
      expect.objectContaining({ key: '0', include: true, duplicate: false, title: 'Work', allDay: false, startTime: '09:00' }),
      expect.objectContaining({ key: '1', include: true, allDay: true, startDay: '2026-10-20', endDay: '2026-10-23' }),
    ])
  })

  it('unticks events already on the calendar', () => {
    const rows = rowsFromParsed(
      [parsed(), parsed({ date: '2026-10-21' }), parsed({ title: 'Holiday', allDay: true, startTime: '', endTime: '' })],
      [
        { title: ' work ', all_day: false, starts_at: local('2026-10-20T09:00'), start_date: null },
        { title: 'Holiday', all_day: true, starts_at: null, start_date: '2026-10-20' },
      ],
    )
    expect(rows.map((r) => [r.duplicate, r.include])).toEqual([
      [true, false],
      [false, true],
      [true, false],
    ])
  })
})

const row = (o: Partial<ImportRow> = {}): ImportRow => ({ ...rowsFromParsed([parsed()], [])[0], ...o })

describe('rowProblem', () => {
  it('accepts good rows', () => {
    expect(rowProblem(row())).toBeNull()
    expect(rowProblem(row({ allDay: true, endDay: '2026-10-22' }))).toBeNull()
  })

  it.each([
    [{ title: '  ' }, 'Add a name.'],
    [{ startDay: '' }, 'Pick a date.'],
    [{ startTime: '' }, 'Pick a start time.'],
    [{ allDay: true, endDay: '2026-10-19' }, 'The end date can’t be before the start date.'],
  ])('flags %j', (o, message) => {
    expect(rowProblem(row(o))).toBe(message)
  })
})

describe('rowToFields', () => {
  it('saves a timed row with local times', () => {
    expect(rowToFields(row({ notes: ' Bring apron ' }), 'me')).toEqual({
      all_day: false,
      start_date: null,
      end_date: null,
      starts_at: local('2026-10-20T09:00'),
      ends_at: local('2026-10-20T17:00'),
      title: 'Work',
      location: 'Café Rio',
      notes: 'Bring apron',
      owner_id: 'me',
    })
  })

  it('saves an all-day row with an exclusive end date', () => {
    expect(rowToFields(row({ allDay: true, endDay: '2026-10-22', location: '' }), null)).toMatchObject({
      all_day: true,
      starts_at: null,
      ends_at: null,
      start_date: '2026-10-20',
      end_date: '2026-10-23',
      location: null,
      owner_id: null,
    })
  })
})

describe('parsedRange', () => {
  it('covers every parsed day with a day to spare', () => {
    const range = parsedRange([parsed({ date: '2026-10-22' }), parsed({ date: '2026-10-20', endDate: '2026-10-25' })])
    expect(range?.start).toEqual(new Date(2026, 9, 19))
    expect(range?.end).toEqual(new Date(2026, 9, 27))
  })

  it('is null without events', () => {
    expect(parsedRange([])).toBeNull()
  })
})
