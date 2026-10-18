import {
  applyCloseTime,
  daysRange,
  endsAtLabel,
  existingKeys,
  expandWeekly,
  fmt12,
  isDuplicate,
  lastStartDay,
  rowProblem,
  rowsFromParsed,
  rowsRange,
  rowsSpanDays,
  rowToFields,
  timedRange,
  type ImportRow,
  type ParsedEvent,
} from './importRows'

const parsed = (o: Partial<ParsedEvent> = {}): ParsedEvent => ({
  title: 'Work',
  date: '2026-10-20',
  endDate: '2026-10-20',
  allDay: false,
  startTime: '09:00',
  endTime: '17:00',
  location: 'Café Rio',
  notes: '',
  dayOff: false,
  endLabel: '',
  ...o,
})

const local = (value: string) => new Date(value).toISOString()

describe('shifts that end at "close"', () => {
  it('formats 12-hour times', () => {
    expect(fmt12('16:00')).toBe('4 PM')
    expect(fmt12('16:30')).toBe('4:30 PM')
    expect(fmt12('00:15')).toBe('12:15 AM')
    expect(fmt12('12:00')).toBe('12 PM')
  })

  it('puts the word in the name and leaves the end open', () => {
    const [row] = rowsFromParsed([parsed({ startTime: '16:00', endTime: '', endLabel: 'close' })], [])
    expect(row).toMatchObject({ title: 'Work (4 PM–close)', startTime: '16:00', endTime: '', endLabel: 'close' })
    expect(endsAtLabel(row)).toBe(true)
    expect(rowToFields(row, 'me').ends_at).toBe(local('2026-10-20T17:00')) // an hour, until a closing time is given
  })

  it('ignores the word when a real end time is known', () => {
    const [row] = rowsFromParsed([parsed({ endLabel: 'close' })], [])
    expect(row).toMatchObject({ title: 'Work', endTime: '17:00', endLabel: '' })
    expect(endsAtLabel(row)).toBe(false)
  })

  it('fills a closing time into only the open-ended rows', () => {
    const rows = rowsFromParsed([parsed({ startTime: '16:00', endTime: '', endLabel: 'close' }), parsed({ date: '2026-10-21' })], [])
    const [close, normal] = applyCloseTime(rows, '23:30')
    expect(close.endTime).toBe('23:30')
    expect(normal.endTime).toBe('17:00')
    expect(rowToFields(close, null).ends_at).toBe(local('2026-10-20T23:30'))
    expect(applyCloseTime(rows, '')).toBe(rows)
    expect(applyCloseTime(rows, '25:00')).toBe(rows)
  })

  it('ends the next morning when close is after midnight', () => {
    const [row] = applyCloseTime(rowsFromParsed([parsed({ startTime: '16:00', endTime: '', endLabel: 'close' })], []), '01:00')
    expect(rowToFields(row, null).ends_at).toBe(local('2026-10-21T01:00'))
  })
})

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

  it('unticks days off but keeps them in the list', () => {
    const [shift, off] = rowsFromParsed([parsed(), parsed({ title: 'Day off', date: '2026-10-21', allDay: true, dayOff: true })], [])
    expect(shift).toMatchObject({ include: true, dayOff: false })
    expect(off).toMatchObject({ include: false, dayOff: true, allDay: true, startDay: '2026-10-21' })
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

describe('expandWeekly', () => {
  const rows = [row(), row({ key: '1', title: 'Night', startDay: '2026-10-24', startTime: '22:00', endTime: '06:00' })]

  it('copies each row forward every week up to the end date, originals first', () => {
    const out = expandWeekly(rows, 1, '2026-11-07')
    expect(out.map((r) => [r.key, r.startDay, r.generated ?? false])).toEqual([
      ['0', '2026-10-20', false],
      ['0+1', '2026-10-27', true],
      ['0+2', '2026-11-03', true],
      ['1', '2026-10-24', false],
      ['1+1', '2026-10-31', true],
      ['1+2', '2026-11-07', true],
    ])
    expect(out[4]).toMatchObject({ title: 'Night', startTime: '22:00', endTime: '06:00', include: true })
  })

  it('can repeat every two weeks and moves all-day spans as a whole', () => {
    const leave = row({ allDay: true, startDay: '2026-10-20', endDay: '2026-10-22' })
    const out = expandWeekly([leave], 2, '2026-11-20')
    expect(out.map((r) => [r.startDay, r.endDay])).toEqual([
      ['2026-10-20', '2026-10-22'],
      ['2026-11-03', '2026-11-05'],
      ['2026-11-17', '2026-11-19'],
    ])
  })

  it('leaves rows alone without a usable end date', () => {
    expect(expandWeekly(rows, 1, '')).toBe(rows)
    expect(expandWeekly(rows, 1, '2026-10-01')).toHaveLength(2)
  })
})

describe('existingKeys / isDuplicate', () => {
  it('matches on name and start, ignoring case and spacing', () => {
    const taken = existingKeys([
      { title: 'WORK ', all_day: false, starts_at: local('2026-10-27T09:00'), start_date: null },
      { title: 'Day off', all_day: true, starts_at: null, start_date: '2026-10-21' },
      { title: 'broken', all_day: false, starts_at: null, start_date: null },
    ])
    expect(isDuplicate(row({ startDay: '2026-10-27' }), taken)).toBe(true)
    expect(isDuplicate(row({ startDay: '2026-10-27', startTime: '10:00' }), taken)).toBe(false)
    expect(isDuplicate(row({ title: 'day off', allDay: true, startDay: '2026-10-21' }), taken)).toBe(true)
    expect(isDuplicate(row({ startDay: 'nope' }), taken)).toBe(false)
  })
})

describe('row date helpers', () => {
  it('measures the span and finds the last day', () => {
    const rows = [row({ startDay: '2026-10-24' }), row({ startDay: '2026-10-17' }), row({ startDay: '2026-10-30' })]
    expect(rowsSpanDays(rows)).toBe(13)
    expect(rowsSpanDays([row()])).toBe(0)
    expect(lastStartDay(rows)).toBe('2026-10-30')
    expect(lastStartDay([])).toBeNull()
  })

  it('covers every day with a day to spare', () => {
    const range = daysRange([parsed({ date: '2026-10-22' }), parsed({ date: '2026-10-20', endDate: '2026-10-25' })])
    expect(range?.start).toEqual(new Date(2026, 9, 19))
    expect(range?.end).toEqual(new Date(2026, 9, 27))
    expect(daysRange([])).toBeNull()
    expect(rowsRange([row({ allDay: true, startDay: '2026-10-20', endDay: '2026-10-25' })])?.end).toEqual(new Date(2026, 9, 27))
  })
})
