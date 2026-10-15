import { isAirbnbBooking, nightsBetween, parseAirbnbDescription, safeHttpUrl } from './airbnb'

const URL_ = 'https://www.airbnb.com/hosting/reservations/details/HMABC12345'

describe('parseAirbnbDescription', () => {
  it('reads the reservation link and phone digits from real newlines', () => {
    const text = `Reservation URL: ${URL_}\nPhone Number (Last 4 Digits): 1234`
    expect(parseAirbnbDescription(text)).toEqual({ reservationUrl: URL_, phoneLast4: '1234' })
  })

  it('reads a description whose line breaks are a literal backslash-n', () => {
    const text = `Reservation URL: ${URL_}\\nPhone Number (Last 4 Digits): 5678`
    expect(parseAirbnbDescription(text)).toEqual({ reservationUrl: URL_, phoneLast4: '5678' })
  })

  it('reads a description whose backslash was escaped twice', () => {
    const text = `Reservation URL: ${URL_}\\\\nPhone Number (Last 4 Digits): 4321`
    expect(parseAirbnbDescription(text)).toEqual({ reservationUrl: URL_, phoneLast4: '4321' })
  })

  it('handles Windows line endings', () => {
    const text = `Reservation URL: ${URL_}\r\nPhone Number (Last 4 Digits): 0042\r\n`
    expect(parseAirbnbDescription(text)).toEqual({ reservationUrl: URL_, phoneLast4: '0042' })
  })

  it('keeps leading zeros in the phone digits as text', () => {
    expect(parseAirbnbDescription('Phone Number (Last 4 Digits): 0007').phoneLast4).toBe('0007')
  })

  it('works when only one of the two lines is present', () => {
    expect(parseAirbnbDescription(`Reservation URL: ${URL_}`)).toEqual({ reservationUrl: URL_ })
    expect(parseAirbnbDescription('Phone Number (Last 4 Digits): 9999')).toEqual({ phoneLast4: '9999' })
  })

  it('works when the phone line comes first', () => {
    const text = `Phone Number (Last 4 Digits): 1111\nReservation URL: ${URL_}`
    expect(parseAirbnbDescription(text)).toEqual({ reservationUrl: URL_, phoneLast4: '1111' })
  })

  it('ignores case in the labels and extra spaces', () => {
    const text = `reservation url:    ${URL_}\nPHONE NUMBER (LAST 4 DIGITS):   2468`
    expect(parseAirbnbDescription(text)).toEqual({ reservationUrl: URL_, phoneLast4: '2468' })
  })

  it('returns an empty object for empty, missing or unrelated text', () => {
    expect(parseAirbnbDescription('')).toEqual({})
    expect(parseAirbnbDescription(null)).toEqual({})
    expect(parseAirbnbDescription(undefined)).toEqual({})
    expect(parseAirbnbDescription('Please bring a towel.')).toEqual({})
  })

  it('does not accept phone numbers that are not exactly 4 digits', () => {
    expect(parseAirbnbDescription('Phone Number (Last 4 Digits): 123')).toEqual({})
    expect(parseAirbnbDescription('Phone Number (Last 4 Digits): 12345')).toEqual({})
    expect(parseAirbnbDescription('Phone Number (Last 4 Digits): abcd')).toEqual({})
  })

  it('drops links that are not http(s)', () => {
    expect(parseAirbnbDescription('Reservation URL: javascript:alert(1)')).toEqual({})
    expect(parseAirbnbDescription('Reservation URL: not a link')).toEqual({})
  })

  it('drops trailing punctuation from the link', () => {
    expect(parseAirbnbDescription(`Reservation URL: ${URL_}.`).reservationUrl).toBe(URL_)
  })
})

describe('safeHttpUrl', () => {
  it('accepts http and https', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeHttpUrl('http://example.com/a')).toBe('http://example.com/a')
  })

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'example.com', ''])('rejects %j', (value) => {
    expect(safeHttpUrl(value)).toBeUndefined()
  })
})

describe('isAirbnbBooking', () => {
  it.each(['Reserved', 'reserved', 'RESERVED', '  Reserved  ', 'Reserved - Alex'])('treats %j as a booking', (summary) => {
    expect(isAirbnbBooking(summary)).toBe(true)
  })

  it.each(['Airbnb (Not available)', 'Not available', 'Blocked', 'Unreserved', 'Pre-reserved', '', null, undefined])(
    'treats %j as blocked dates',
    (summary) => {
      expect(isAirbnbBooking(summary)).toBe(false)
    },
  )
})

describe('nightsBetween', () => {
  it('counts the nights from check-in day to check-out day', () => {
    expect(nightsBetween(new Date(2026, 9, 17), new Date(2026, 9, 20))).toBe(3)
  })

  it('counts across month and year ends', () => {
    expect(nightsBetween(new Date(2026, 11, 30), new Date(2027, 0, 2))).toBe(3)
  })

  it('never returns less than one night', () => {
    expect(nightsBetween(new Date(2026, 9, 17), new Date(2026, 9, 17))).toBe(1)
  })
})
