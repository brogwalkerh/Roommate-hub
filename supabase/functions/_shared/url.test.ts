import { checkFeedUrl, isPrivateAddress } from './url'

describe('checkFeedUrl', () => {
  it.each([
    'https://www.airbnb.com/calendar/ical/123456.ics?s=abcdef',
    'webcal://p123-caldav.icloud.com/published/2/abc',
    'https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-abc/basic.ics',
    'https://8.8.8.8/cal.ics',
  ])('accepts %s', (url) => {
    expect(checkFeedUrl(url)).toBeNull()
  })

  it.each([
    ['http://example.com/cal.ics', /https/],
    ['ftp://example.com/cal.ics', /https/],
    ['not a url', /web address/],
    ['https://localhost/cal.ics', /private/],
    ['https://localhost./cal.ics', /private/],
    ['https://127.0.0.1/cal.ics', /private/],
    ['https://10.1.2.3/cal.ics', /private/],
    ['https://192.168.1.10/cal.ics', /private/],
    ['https://172.20.0.1/cal.ics', /private/],
    ['https://100.64.1.1/cal.ics', /private/],
    ['https://169.254.169.254/latest/meta-data', /private/],
    ['https://[::1]/cal.ics', /private/],
    ['https://[::]/cal.ics', /private/],
    ['https://[::ffff:127.0.0.1]/cal.ics', /private/],
    ['https://[::ffff:169.254.169.254]/x', /private/],
    ['https://[fd00::1]/x', /private/],
    ['https://metadata.google.internal/x', /private/],
    ['https://metadata.google.internal./x', /private/],
    ['https://user:pass@example.com/cal.ics', /username/],
  ])('rejects %s', (url, message) => {
    expect(checkFeedUrl(url)).toMatch(message)
  })
})

describe('isPrivateAddress', () => {
  it.each(['10.0.0.1', '127.0.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', '::ffff:10.0.0.1'])('%s is private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '172.32.0.1'])('%s is public', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false)
  })
})
