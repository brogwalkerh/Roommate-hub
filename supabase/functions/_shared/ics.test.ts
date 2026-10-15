import ICAL from 'ical.js'
import { parseIcs } from './ics'

// Shape of an Airbnb host "Export calendar" feed.
const AIRBNB = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN',
  'CALSCALE:GREGORIAN',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20261020',
  'DTSTART;VALUE=DATE:20261017',
  'UID:1418fb94e984-1d4d1e1b9e1b@airbnb.com',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC12345\\nPhone Number (Last 4 Digits): 1234',
  'SUMMARY:Reserved',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20261102',
  'DTSTART;VALUE=DATE:20261101',
  'UID:7f9e-blocked@airbnb.com',
  'SUMMARY:Airbnb (Not available)',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

// Google-style feed with a time zone and a weekly series with one moved and one cancelled occurrence.
const GOOGLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'BEGIN:VTIMEZONE',
  'TZID:America/Los_Angeles',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0800',
  'TZOFFSETTO:-0700',
  'TZNAME:PDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0800',
  'TZNAME:PST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/Los_Angeles:20261005T090000',
  'DTEND;TZID=America/Los_Angeles:20261005T170000',
  'RRULE:FREQ=WEEKLY;COUNT=6',
  'EXDATE;TZID=America/Los_Angeles:20261019T090000',
  'UID:shift-123@google.com',
  'SUMMARY:Work shift',
  'LOCATION:Downtown',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/Los_Angeles:20261013T120000',
  'DTEND;TZID=America/Los_Angeles:20261013T180000',
  'RECURRENCE-ID;TZID=America/Los_Angeles:20261012T090000',
  'UID:shift-123@google.com',
  'SUMMARY:Work shift (moved)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/Los_Angeles:20261021T190000',
  'DTEND;TZID=America/Los_Angeles:20261021T200000',
  'UID:cancelled@google.com',
  'STATUS:CANCELLED',
  'SUMMARY:Cancelled thing',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

const windowOpts = {
  windowStart: new Date('2026-09-01T00:00:00Z'),
  windowEnd: new Date('2027-12-31T00:00:00Z'),
}

describe('parseIcs', () => {
  it('reads Airbnb bookings as all-day rows with check-in and check-out dates', () => {
    const rows = parseIcs(ICAL, AIRBNB, { ...windowOpts, privacy: 'details' })
    expect(rows).toHaveLength(2)
    const stay = rows.find((r) => r.summary === 'Reserved')!
    expect(stay).toMatchObject({
      all_day: true,
      start_date: '2026-10-17',
      end_date: '2026-10-20',
      starts_at: null,
      recurrence_id: '',
    })
    expect(stay.description).toContain('HMABC12345')
    expect(stay.description).toContain('1234')
  })

  it('expands a weekly series in its time zone, applying moved, excluded and cancelled occurrences', () => {
    const rows = parseIcs(ICAL, GOOGLE, { ...windowOpts, privacy: 'details' })
    const shifts = rows.filter((r) => r.uid === 'shift-123@google.com')
    // 6 occurrences minus 1 EXDATE.
    expect(shifts).toHaveLength(5)
    // 9:00 PDT = 16:00 UTC
    expect(shifts[0]).toMatchObject({ summary: 'Work shift', location: 'Downtown', starts_at: '2026-10-05T16:00:00.000Z' })
    const moved = shifts.find((r) => r.summary === 'Work shift (moved)')!
    expect(moved.starts_at).toBe('2026-10-13T19:00:00.000Z')
    // After the Nov 1 DST change, 9:00 PST = 17:00 UTC.
    expect(shifts.at(-1)!.starts_at).toBe('2026-11-09T17:00:00.000Z')
    expect(rows.some((r) => r.uid === 'cancelled@google.com')).toBe(false)
    expect(new Set(shifts.map((r) => r.recurrence_id)).size).toBe(5)
  })

  it('hides details for busy-only calendars', () => {
    const rows = parseIcs(ICAL, GOOGLE, { ...windowOpts, privacy: 'busy' })
    expect(rows.every((r) => r.summary === 'Busy' && r.location === null && r.description === null)).toBe(true)
  })

  it('drops events outside the window', () => {
    const rows = parseIcs(ICAL, AIRBNB, {
      windowStart: new Date('2027-01-01T00:00:00Z'),
      windowEnd: new Date('2027-02-01T00:00:00Z'),
      privacy: 'details',
    })
    expect(rows).toHaveLength(0)
  })

  it('gives a one-day all-day event a next-day end when DTEND is missing', () => {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:x', 'DTSTART;VALUE=DATE:20261101', 'SUMMARY:Day', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const [row] = parseIcs(ICAL, ics, { ...windowOpts, privacy: 'details' })
    expect(row).toMatchObject({ start_date: '2026-11-01', end_date: '2026-11-02' })
  })
})
