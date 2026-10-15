import type { GuestStay } from '../schedule/hooks'
import { greeting, stayStatus } from './summary'

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h)
const stay = (inDay: number, outDay: number, id = `s${inDay}`): GuestStay => ({
  id,
  checkIn: d(2026, 10, inDay, 0),
  checkOut: d(2026, 10, outDay, 0),
  nights: outDay - inDay,
  feedName: 'Spare room',
})

describe('greeting', () => {
  it.each([
    [3, 'Good evening'],
    [8, 'Good morning'],
    [13, 'Good afternoon'],
    [20, 'Good evening'],
  ])('at %i:00 says %s', (hour, text) => {
    expect(greeting(d(2026, 10, 15, hour))).toBe(text)
  })
})

describe('stayStatus', () => {
  const now = d(2026, 10, 15, 10)

  it('returns null with no current or upcoming stays', () => {
    expect(stayStatus([], now)).toBeNull()
    expect(stayStatus([stay(10, 12)], now)).toBeNull()
  })

  it('announces a check-in today', () => {
    expect(stayStatus([stay(15, 18)], now)).toEqual({
      headline: 'Guest checks in today',
      detail: expect.stringMatching(/^3 nights · checks out /),
      active: true,
    })
  })

  it('announces a check-out today ahead of a later booking', () => {
    expect(stayStatus([stay(20, 22), stay(12, 15)], now)?.headline).toBe('Guest checks out today')
  })

  it('describes a stay in progress', () => {
    const s = stayStatus([stay(13, 18)], now)
    expect(s?.headline).toBe('Guest staying now')
    expect(s?.detail).toMatch(/· 3 nights left$/)
  })

  it('describes the next stay', () => {
    expect(stayStatus([stay(16, 17)], now)).toMatchObject({ headline: 'Guest checks in tomorrow', active: false })
    expect(stayStatus([stay(25, 27), stay(20, 22)], now)).toMatchObject({ headline: 'Next guest in 5 days' })
  })
})
