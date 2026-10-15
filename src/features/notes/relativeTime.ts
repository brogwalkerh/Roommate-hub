import { differenceInSeconds, formatDistanceToNowStrict, parseISO } from 'date-fns'

/** "just now", "3 minutes ago", "2 days ago" for a timestamp from the database. */
export function relativeTime(iso: string): string {
  // parseISO (unlike new Date) reads the microseconds Postgres sends on every browser.
  const date = parseISO(iso)
  if (Number.isNaN(date.getTime())) return ''
  if (differenceInSeconds(new Date(), date) < 45) return 'just now'
  return formatDistanceToNowStrict(date, { addSuffix: true })
}
