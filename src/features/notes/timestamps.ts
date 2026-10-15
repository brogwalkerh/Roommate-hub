// Postgres timestamps have microsecond precision, but a JavaScript Date keeps
// only milliseconds. Notes use `updated_at` as a version token (optimistic
// concurrency), so it must travel as the exact string the server sent and be
// compared without rounding. These helpers never go through `new Date()` for
// the fractional part.

const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/

type Parsed = { seconds: number; micros: number }

function parse(value: string): Parsed | null {
  const m = TIMESTAMP.exec(value.trim())
  if (!m) return null
  const [, year, month, day, hour, minute, second, fraction = '', zone = 'Z'] = m
  let offsetMinutes = 0
  if (zone !== 'Z') {
    const digits = zone.slice(1).replace(':', '')
    const hours = Number(digits.slice(0, 2))
    const minutes = Number(digits.slice(2) || '0')
    offsetMinutes = (zone.startsWith('-') ? -1 : 1) * (hours * 60 + minutes)
  }
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  if (Number.isNaN(ms)) return null
  return {
    seconds: ms / 1000 - offsetMinutes * 60,
    micros: Number(fraction.padEnd(6, '0').slice(0, 6)),
  }
}

/** Negative when `a` is earlier than `b`, positive when later, 0 when the same instant. */
export function compareTimestamps(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0
  if (pa.seconds !== pb.seconds) return pa.seconds < pb.seconds ? -1 : 1
  if (pa.micros !== pb.micros) return pa.micros < pb.micros ? -1 : 1
  return 0
}

/** True when `candidate` is strictly later than `reference`. */
export function isNewer(candidate: string, reference: string): boolean {
  return compareTimestamps(candidate, reference) > 0
}
