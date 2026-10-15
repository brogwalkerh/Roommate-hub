import {
  defaultTimedRange,
  moveStart,
  newEventValues,
  setAllDay,
  toSaveFields,
  validateEventForm,
  valuesFromRow,
  type EventFormValues,
} from './eventForm'
import type { EventRow } from './types'

const OWNER = 'user-1'

function timed(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    title: 'Dentist',
    allDay: false,
    startDay: '2026-10-15',
    endDay: '2026-10-15',
    startAt: '2026-10-15T14:00',
    endAt: '2026-10-15T15:00',
    ownerId: OWNER,
    location: '',
    notes: '',
    ...overrides,
  }
}

function allDay(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return timed({ allDay: true, startDay: '2026-10-15', endDay: '2026-10-17', ...overrides })
}

function row(overrides: Partial<EventRow>): EventRow {
  return {
    id: 'e1',
    title: 'Event',
    notes: null,
    location: null,
    owner_id: null,
    all_day: false,
    starts_at: null,
    ends_at: null,
    start_date: null,
    end_date: null,
    created_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('newEventValues', () => {
  it('defaults to the next whole hour for one hour', () => {
    const range = defaultTimedRange(new Date(2026, 9, 15, 14, 20))
    expect(range.start).toEqual(new Date(2026, 9, 15, 15, 0))
    expect(range.end).toEqual(new Date(2026, 9, 15, 16, 0))
    expect(newEventValues(OWNER, undefined, new Date(2026, 9, 15, 14, 20))).toMatchObject({
      allDay: false,
      startAt: '2026-10-15T15:00',
      endAt: '2026-10-15T16:00',
      ownerId: OWNER,
      title: '',
    })
  })

  it('prefills an all-day pick, turning the exclusive end into the last day', () => {
    const values = newEventValues(null, { start: new Date(2026, 9, 15), end: new Date(2026, 9, 18), allDay: true })
    expect(values).toMatchObject({ allDay: true, startDay: '2026-10-15', endDay: '2026-10-17', ownerId: null })
  })

  it('prefills a single clicked day as a one-day event', () => {
    const values = newEventValues(OWNER, { start: new Date(2026, 9, 15), end: new Date(2026, 9, 16), allDay: true })
    expect(values).toMatchObject({ startDay: '2026-10-15', endDay: '2026-10-15' })
  })

  it('prefills a timed pick', () => {
    const values = newEventValues(OWNER, {
      start: new Date(2026, 9, 15, 9, 0),
      end: new Date(2026, 9, 15, 10, 30),
      allDay: false,
    })
    expect(values).toMatchObject({ allDay: false, startAt: '2026-10-15T09:00', endAt: '2026-10-15T10:30' })
  })

  it('keeps both versions of the dates in step, so All day can be toggled', () => {
    const values = newEventValues(OWNER, { start: new Date(2026, 9, 15), end: new Date(2026, 9, 16), allDay: true })
    expect(values.startAt).toBe('2026-10-15T09:00')
    expect(values.endAt).toBe('2026-10-15T10:00')
  })
})

describe('valuesFromRow', () => {
  it('shows an all-day row with an inclusive last day', () => {
    const values = valuesFromRow(row({ all_day: true, start_date: '2026-10-15', end_date: '2026-10-18', title: 'Trip', owner_id: OWNER }))
    expect(values).toMatchObject({ allDay: true, startDay: '2026-10-15', endDay: '2026-10-17', title: 'Trip', ownerId: OWNER })
  })

  it('shows a timed row in local time', () => {
    const values = valuesFromRow(
      row({
        starts_at: new Date(2026, 9, 15, 9, 30).toISOString(),
        ends_at: new Date(2026, 9, 15, 10, 15).toISOString(),
        location: 'Clinic',
        notes: 'Bring forms',
      }),
    )
    expect(values).toMatchObject({
      allDay: false,
      startAt: '2026-10-15T09:30',
      endAt: '2026-10-15T10:15',
      startDay: '2026-10-15',
      endDay: '2026-10-15',
      location: 'Clinic',
      notes: 'Bring forms',
    })
  })
})

describe('setAllDay', () => {
  it('moves from timed to all-day using the date parts', () => {
    const values = setAllDay(timed({ startAt: '2026-10-15T22:00', endAt: '2026-10-16T01:00' }), true)
    expect(values).toMatchObject({ allDay: true, startDay: '2026-10-15', endDay: '2026-10-16' })
  })

  it('moves from all-day to timed, keeping the days and the last-used times', () => {
    const values = setAllDay(allDay({ startAt: '2026-10-15T08:15', endAt: '2026-10-15T09:45' }), false)
    expect(values).toMatchObject({ allDay: false, startAt: '2026-10-15T08:15', endAt: '2026-10-17T09:45' })
  })

  it('gives the end an hour after the start when the old times would put it earlier', () => {
    const values = setAllDay(allDay({ startDay: '2026-10-15', endDay: '2026-10-15', startAt: '2026-10-15T14:00', endAt: '2026-10-15T09:00' }), false)
    expect(values.startAt).toBe('2026-10-15T14:00')
    expect(values.endAt).toBe('2026-10-15T15:00')
  })

  it('returns the same values when nothing changes', () => {
    const values = timed()
    expect(setAllDay(values, false)).toBe(values)
  })

  it('round-trips a single day without losing its times', () => {
    const start = timed({ startAt: '2026-10-15T17:30', endAt: '2026-10-15T18:30' })
    expect(setAllDay(setAllDay(start, true), false)).toMatchObject({ startAt: '2026-10-15T17:30', endAt: '2026-10-15T18:30' })
  })
})

describe('moveStart', () => {
  it('leaves the end alone while the new start is still before it', () => {
    expect(moveStart(timed(), '2026-10-15T14:30')).toMatchObject({ startAt: '2026-10-15T14:30', endAt: '2026-10-15T15:00' })
  })

  it('moves the end along, keeping the length, when the start passes it', () => {
    expect(moveStart(timed(), '2026-10-15T18:00')).toMatchObject({ startAt: '2026-10-15T18:00', endAt: '2026-10-15T19:00' })
    expect(moveStart(timed({ endAt: '2026-10-15T16:30' }), '2026-10-16T09:00')).toMatchObject({ endAt: '2026-10-16T11:30' })
  })

  it('does the same for all-day spans', () => {
    expect(moveStart(allDay(), '2026-10-16')).toMatchObject({ startDay: '2026-10-16', endDay: '2026-10-17' })
    expect(moveStart(allDay(), '2026-10-20')).toMatchObject({ startDay: '2026-10-20', endDay: '2026-10-22' })
  })

  it('keeps whatever was typed when the new value is empty or invalid', () => {
    expect(moveStart(timed(), '')).toMatchObject({ startAt: '', endAt: '2026-10-15T15:00' })
    expect(moveStart(allDay(), '')).toMatchObject({ startDay: '', endDay: '2026-10-17' })
  })
})

describe('validateEventForm', () => {
  it('asks for a title', () => {
    expect(validateEventForm(timed({ title: '   ' })).title).toBe('Add a title.')
  })

  it('limits the title to 200 characters', () => {
    expect(validateEventForm(timed({ title: 'x'.repeat(201) })).title).toMatch(/200/)
    expect(validateEventForm(timed({ title: 'x'.repeat(200) })).title).toBeUndefined()
  })

  it('checks the range for the active mode only', () => {
    expect(validateEventForm(timed({ endDay: '2000-01-01' })).range).toBeUndefined()
    expect(validateEventForm(allDay({ endAt: '2000-01-01T00:00' })).range).toBeUndefined()
    expect(validateEventForm(allDay({ endDay: '2026-10-14' })).range).toMatch(/before the start/)
    expect(validateEventForm(timed({ endAt: '2026-10-15T13:00' })).range).toMatch(/before the start/)
  })

  it('passes a good form', () => {
    expect(validateEventForm(timed())).toEqual({})
  })
})

describe('toSaveFields', () => {
  it('builds a timed event and clears the date columns', () => {
    const result = toSaveFields(timed({ title: '  Dentist  ', location: ' Clinic ', notes: '' }))
    expect(result).toEqual({
      ok: true,
      fields: {
        title: 'Dentist',
        notes: null,
        location: 'Clinic',
        owner_id: OWNER,
        all_day: false,
        starts_at: new Date(2026, 9, 15, 14, 0).toISOString(),
        ends_at: new Date(2026, 9, 15, 15, 0).toISOString(),
        start_date: null,
        end_date: null,
      },
    })
  })

  it('builds an all-day event with an exclusive end and clears the timestamps', () => {
    const result = toSaveFields(allDay({ notes: 'Pack light', ownerId: null }))
    expect(result).toEqual({
      ok: true,
      fields: {
        title: 'Dentist',
        notes: 'Pack light',
        location: null,
        owner_id: null,
        all_day: true,
        starts_at: null,
        ends_at: null,
        start_date: '2026-10-15',
        end_date: '2026-10-18',
      },
    })
  })

  it('refuses a form with errors', () => {
    const result = toSaveFields(timed({ title: '', endAt: '2026-10-15T13:00' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['range', 'title'])
  })
})
