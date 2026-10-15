import { differenceInCalendarDays, startOfDay } from 'date-fns'
import { formatDay } from '../../lib/dates'
import type { GuestStay } from '../schedule/hooks'

/** "Good morning" / "Good afternoon" / "Good evening" for a local time. */
export function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export type StayStatus = {
  /** Short headline, e.g. "Guest checks in today". */
  headline: string
  /** Supporting line, e.g. "3 nights · checks out Mon, Oct 20". */
  detail: string
  /** True when a guest is in the space right now (or arrives today). */
  active: boolean
}

const nightsText = (n: number) => `${n} night${n === 1 ? '' : 's'}`

/**
 * Describe the most relevant guest stay relative to `now`: one in progress,
 * else the next check-in. Dates are calendar days (check-in/check-out days).
 */
export function stayStatus(stays: readonly GuestStay[], now: Date): StayStatus | null {
  const today = startOfDay(now)
  const relevant = stays
    .filter((s) => differenceInCalendarDays(s.checkOut, today) >= 0)
    .sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime())
  const current = relevant.find((s) => differenceInCalendarDays(s.checkIn, today) <= 0)
  if (current) {
    const out = differenceInCalendarDays(current.checkOut, today)
    if (out === 0) return { headline: 'Guest checks out today', detail: current.feedName, active: true }
    if (differenceInCalendarDays(current.checkIn, today) === 0) {
      return {
        headline: 'Guest checks in today',
        detail: `${nightsText(current.nights)} · checks out ${formatDay(current.checkOut)}`,
        active: true,
      }
    }
    return {
      headline: 'Guest staying now',
      detail: `Checks out ${formatDay(current.checkOut)}${out === 1 ? '' : ` · ${out} nights left`}`,
      active: true,
    }
  }
  const next = relevant[0]
  if (!next) return null
  const days = differenceInCalendarDays(next.checkIn, today)
  return {
    headline: days === 1 ? 'Guest checks in tomorrow' : `Next guest in ${days} days`,
    detail: `${formatDay(next.checkIn)} · ${nightsText(next.nights)}`,
    active: false,
  }
}
