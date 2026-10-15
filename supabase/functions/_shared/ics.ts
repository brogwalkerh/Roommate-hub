// Parse an iCalendar (.ics) feed into feed_events rows.
// Runtime-agnostic: the caller passes in the ical.js module, so the same code
// runs in the Deno Edge Function and in Vitest under Node.

// deno-lint-ignore-file no-explicit-any
type IcalLib = any

export type FeedEventRow = {
  uid: string
  recurrence_id: string
  summary: string | null
  description: string | null
  location: string | null
  url: string | null
  all_day: boolean
  starts_at: string | null
  ends_at: string | null
  start_date: string | null
  end_date: string | null
}

export type ParseOptions = {
  windowStart: Date
  windowEnd: Date
  /** 'busy' hides titles and details, for personal calendars shared as free/busy. */
  privacy: 'details' | 'busy'
  /** Safety cap per recurring series. */
  maxOccurrencesPerSeries?: number
  /** Safety cap for the whole feed. */
  maxRows?: number
}

const pad = (n: number) => String(n).padStart(2, '0')

function dateString(t: any): string {
  return `${t.year}-${pad(t.month)}-${pad(t.day)}`
}

function rowFor(
  item: any,
  start: any,
  end: any,
  recurrenceId: string,
  privacy: ParseOptions['privacy'],
): FeedEventRow {
  const allDay = !!start.isDate
  let endTime = end
  if (!endTime) {
    endTime = start.clone()
    if (allDay) endTime.adjust(1, 0, 0, 0)
  }
  // Some feeds send DTEND equal to DTSTART for one-day all-day events.
  if (allDay && endTime.compare(start) <= 0) {
    endTime = start.clone()
    endTime.adjust(1, 0, 0, 0)
  }
  const busy = privacy === 'busy'
  const urlProp = item.component?.getFirstPropertyValue?.('url')
  return {
    uid: String(item.uid ?? ''),
    recurrence_id: recurrenceId,
    summary: busy ? 'Busy' : (item.summary ?? null) || null,
    description: busy ? null : (item.description ?? null) || null,
    location: busy ? null : (item.location ?? null) || null,
    url: busy ? null : urlProp ? String(urlProp) : null,
    all_day: allDay,
    starts_at: allDay ? null : start.toJSDate().toISOString(),
    ends_at: allDay ? null : endTime.toJSDate().toISOString(),
    start_date: allDay ? dateString(start) : null,
    end_date: allDay ? dateString(endTime) : null,
  }
}

function overlaps(start: any, end: any, windowStart: Date, windowEnd: Date): boolean {
  const s = start.toJSDate()
  const e = (end ?? start).toJSDate()
  return e >= windowStart && s <= windowEnd
}

export function parseIcs(ICAL: IcalLib, text: string, opts: ParseOptions): FeedEventRow[] {
  const maxPerSeries = opts.maxOccurrencesPerSeries ?? 500
  const maxRows = opts.maxRows ?? 5000
  const root = new ICAL.Component(ICAL.parse(text))

  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz)
    } catch {
      // Ignore malformed time zone blocks; times fall back to UTC offsets.
    }
  }

  const masters = new Map<string, any>()
  const orphanExceptions: any[] = []
  const events = root.getAllSubcomponents('vevent').map((ve: any) => new ICAL.Event(ve))

  for (const ev of events) {
    if (!ev.uid) continue
    if (!ev.isRecurrenceException()) masters.set(ev.uid, ev)
  }
  for (const ev of events) {
    if (!ev.uid || !ev.isRecurrenceException()) continue
    const master = masters.get(ev.uid)
    if (master && master.isRecurring()) master.relateException(ev)
    else orphanExceptions.push(ev)
  }

  const rows: FeedEventRow[] = []
  const cancelled = (ev: any) => String(ev.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'

  for (const ev of masters.values()) {
    if (rows.length >= maxRows) break
    if (cancelled(ev)) continue
    if (!ev.isRecurring()) {
      if (overlaps(ev.startDate, ev.endDate, opts.windowStart, opts.windowEnd)) {
        rows.push(rowFor(ev, ev.startDate, ev.endDate, '', opts.privacy))
      }
      continue
    }
    const it = ev.iterator()
    let count = 0
    let next: any
    while ((next = it.next()) && count < maxPerSeries && rows.length < maxRows) {
      if (next.toJSDate() > opts.windowEnd) break
      const details = ev.getOccurrenceDetails(next)
      if (cancelled(details.item)) continue
      if (!overlaps(details.startDate, details.endDate, opts.windowStart, opts.windowEnd)) continue
      rows.push(rowFor(details.item, details.startDate, details.endDate, next.toString(), opts.privacy))
      count++
    }
  }

  for (const ev of orphanExceptions) {
    if (rows.length >= maxRows) break
    if (cancelled(ev)) continue
    if (overlaps(ev.startDate, ev.endDate, opts.windowStart, opts.windowEnd)) {
      rows.push(rowFor(ev, ev.startDate, ev.endDate, ev.recurrenceId?.toString() ?? '', opts.privacy))
    }
  }

  // The database has a unique key on (uid, recurrence_id); keep the first of any duplicates.
  const seen = new Set<string>()
  return rows.filter((r) => {
    const key = `${r.uid}\u0000${r.recurrence_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
