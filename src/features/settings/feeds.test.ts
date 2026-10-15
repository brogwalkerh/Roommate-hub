import { validateFeedUrl } from './feeds'

describe('validateFeedUrl', () => {
  it('accepts Airbnb export links', () => {
    expect(validateFeedUrl('https://www.airbnb.com/calendar/ical/12345678.ics?s=0123abcd', 'airbnb')).toBeNull()
    expect(validateFeedUrl('https://www.airbnb.co.uk/calendar/ical/1.ics?s=x', 'airbnb')).toBeNull()
  })

  it('rejects non-Airbnb links for an Airbnb calendar', () => {
    expect(validateFeedUrl('https://calendar.google.com/x.ics', 'airbnb')).toMatch(/isn’t an Airbnb link/)
    expect(validateFeedUrl('https://airbnb.com.evil.example/x.ics', 'airbnb')).toMatch(/isn’t an Airbnb link/)
  })

  it('accepts webcal links for personal calendars', () => {
    expect(validateFeedUrl('webcal://p01-caldav.icloud.com/published/2/abc', 'ical')).toBeNull()
  })

  it('explains empty, malformed and insecure links', () => {
    expect(validateFeedUrl('  ', 'ical')).toMatch(/Paste/)
    expect(validateFeedUrl('calendar please', 'ical')).toMatch(/doesn’t look like a link/)
    expect(validateFeedUrl('http://example.com/a.ics', 'ical')).toMatch(/https/)
    expect(validateFeedUrl('https://me:secret@example.com/a.ics', 'ical')).toMatch(/username/)
  })
})
