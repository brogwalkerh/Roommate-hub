import { base64Bytes, buildUserPrompt, MAX_EVENTS, normalizeEvents, validateParseRequest } from './schedule'

const pdf = { type: 'pdf', media_type: 'application/pdf', data: 'JVBERi0xLjQK' }

describe('validateParseRequest', () => {
  it('accepts a PDF, an image and text', () => {
    expect(validateParseRequest({ source: pdf, today: '2026-10-17', filename: 'rota.pdf' })).toEqual({
      ok: true,
      value: { source: pdf, filename: 'rota.pdf', today: '2026-10-17', weekOf: null },
    })
    const image = { type: 'image', media_type: 'image/jpeg', data: 'abcd' }
    expect(validateParseRequest({ source: image, today: '2026-10-17', week_of: '2026-10-19' })).toMatchObject({
      ok: true,
      value: { source: image, weekOf: '2026-10-19' },
    })
    expect(validateParseRequest({ source: { type: 'text', data: 'Mon,9-5' }, today: '2026-10-17' })).toMatchObject({ ok: true })
  })

  it.each([
    [{ source: pdf, today: '2026-02-30' }, 'invalid_request'],
    [{ source: pdf, today: '2026-10-17', week_of: 'soon' }, 'invalid_request'],
    [{ source: { type: 'image', media_type: 'image/svg+xml', data: 'abcd' }, today: '2026-10-17' }, 'unsupported_file'],
    [{ source: { type: 'pdf', media_type: 'application/pdf', data: 'not base64!' }, today: '2026-10-17' }, 'unsupported_file'],
    [{ source: { type: 'text', data: '' }, today: '2026-10-17' }, 'unsupported_file'],
    [{ source: { type: 'text', data: 'x'.repeat(200_001) }, today: '2026-10-17' }, 'file_too_large'],
    [{ source: { ...pdf, data: 'A'.repeat(14_000_000) }, today: '2026-10-17' }, 'file_too_large'],
    [null, 'invalid_request'],
  ])('rejects %#', (body, error) => {
    expect(validateParseRequest(body)).toEqual({ ok: false, error })
  })
})

describe('base64Bytes', () => {
  it('counts decoded bytes', () => {
    expect(base64Bytes(btoa('hello'))).toBe(5)
    expect(base64Bytes(btoa('hell'))).toBe(4)
    expect(base64Bytes(btoa('hel'))).toBe(3)
  })
})

describe('buildUserPrompt', () => {
  it('names today and the week for undated schedules', () => {
    const text = buildUserPrompt({ today: '2026-10-17', weekOf: '2026-10-19', filename: 'week.png' })
    expect(text).toContain('Today is 2026-10-17')
    expect(text).toContain('week starting Monday 2026-10-19')
    expect(text).toContain('"week.png"')
  })
})

const ev = (o: Record<string, unknown> = {}) => ({
  title: 'Work',
  date: '2026-10-20',
  end_date: '',
  all_day: false,
  start_time: '09:00',
  end_time: '17:00',
  location: '',
  notes: '',
  ...o,
})

describe('normalizeEvents', () => {
  it('keeps good events, sorted by start', () => {
    const out = normalizeEvents({
      events: [ev({ date: '2026-10-21' }), ev({ title: '  Night   shift ', start_time: '22:00', end_time: '06:00' })],
      warnings: ['Row 3 was blurry'],
    })
    expect(out.dropped).toBe(0)
    expect(out.warnings).toEqual(['Row 3 was blurry'])
    expect(out.events).toEqual([
      { title: 'Night shift', date: '2026-10-20', endDate: '2026-10-20', allDay: false, startTime: '22:00', endTime: '06:00', location: '', notes: '' },
      { title: 'Work', date: '2026-10-21', endDate: '2026-10-21', allDay: false, startTime: '09:00', endTime: '17:00', location: '', notes: '' },
    ])
  })

  it('drops events with no title or an impossible date', () => {
    const out = normalizeEvents({ events: [ev({ title: ' ' }), ev({ date: '2026-13-01' }), ev({ date: 'Monday' }), ev()], warnings: [] })
    expect(out.events).toHaveLength(1)
    expect(out.dropped).toBe(3)
  })

  it('treats events without a valid start time as all day', () => {
    const [a, b] = normalizeEvents({
      events: [ev({ start_time: '' }), ev({ date: '2026-10-22', start_time: '25:00', end_time: '26:00' })],
      warnings: [],
    }).events
    expect(a).toMatchObject({ allDay: true, startTime: '', endTime: '' })
    expect(b).toMatchObject({ allDay: true, startTime: '', endTime: '' })
  })

  it('keeps a multi-day all-day span, and ignores an end date before the start', () => {
    const [trip, bad] = normalizeEvents({
      events: [
        ev({ title: 'Leave', all_day: true, end_date: '2026-10-24', start_time: '', end_time: '' }),
        ev({ title: 'Off', date: '2026-10-25', all_day: true, end_date: '2026-10-01' }),
      ],
      warnings: [],
    }).events
    expect(trip).toMatchObject({ date: '2026-10-20', endDate: '2026-10-24', allDay: true })
    expect(bad).toMatchObject({ date: '2026-10-25', endDate: '2026-10-25', allDay: true, startTime: '' })
  })

  it('drops an unusable end time but keeps the event', () => {
    expect(normalizeEvents({ events: [ev({ end_time: '5pm' })], warnings: [] }).events[0].endTime).toBe('')
  })

  it('caps the number of events', () => {
    const many = Array.from({ length: MAX_EVENTS + 5 }, (_, i) => ev({ title: `Shift ${i}` }))
    const out = normalizeEvents({ events: many, warnings: [] })
    expect(out.events).toHaveLength(MAX_EVENTS)
    expect(out.dropped).toBe(5)
    expect(out.warnings.at(-1)).toContain(String(MAX_EVENTS))
  })

  it('survives garbage', () => {
    expect(normalizeEvents('nope')).toEqual({ events: [], warnings: [], dropped: 0 })
    expect(normalizeEvents({ events: [null, 4, 'x'] })).toMatchObject({ events: [], dropped: 3 })
  })
})
