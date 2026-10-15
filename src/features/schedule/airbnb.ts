import { differenceInCalendarDays } from 'date-fns'

export type AirbnbDetails = {
  reservationUrl?: string
  phoneLast4?: string
}

/**
 * Airbnb's export puts a reservation link and the last 4 digits of the guest's
 * phone number in DESCRIPTION. Depending on how the feed was synced, line
 * breaks arrive as real newlines or as a literal backslash-n.
 */
function normalizeDescription(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\\+[nN]/g, '\n')
    .replace(/\\([,;\\])/g, '$1')
}

/** Accept only http(s) links, so a feed can't smuggle in a `javascript:` URL. */
export function safeHttpUrl(value: string): string | undefined {
  const trimmed = value.replace(/[.,;]+$/, '')
  try {
    const { protocol } = new URL(trimmed)
    return protocol === 'https:' || protocol === 'http:' ? trimmed : undefined
  } catch {
    return undefined
  }
}

/**
 * Accept only https links on Airbnb's own domains for the reservation button,
 * so a tampered feed can't turn it into a look-alike login page.
 */
export function safeAirbnbUrl(value: string): string | undefined {
  const url = safeHttpUrl(value)
  if (!url) return undefined
  const { protocol, hostname } = new URL(url)
  return protocol === 'https:' && /(^|\.)airbnb\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i.test(hostname) ? url : undefined
}

/** Pull the reservation link and phone last 4 out of an Airbnb DESCRIPTION. */
export function parseAirbnbDescription(text: string | null | undefined): AirbnbDetails {
  if (!text) return {}
  const clean = normalizeDescription(text)
  const details: AirbnbDetails = {}

  const url = /Reservation URL:\s*(\S+)/i.exec(clean)?.[1]
  const safeUrl = url ? safeAirbnbUrl(url) : undefined
  if (safeUrl) details.reservationUrl = safeUrl

  const phone = /Phone Number\s*\(Last 4 Digits\)\s*:\s*(\d{4})(?!\d)/i.exec(clean)?.[1]
  if (phone) details.phoneLast4 = phone

  return details
}

/**
 * Airbnb marks a booking with the summary "Reserved". Everything else
 * ("Airbnb (Not available)" and so on) is a block on the calendar.
 */
export function isAirbnbBooking(summary: string | null | undefined): boolean {
  return /^reserved\b/i.test((summary ?? '').trim())
}

/** Nights between check-in and check-out days. A booking is at least one night. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.max(1, differenceInCalendarDays(checkOut, checkIn))
}
