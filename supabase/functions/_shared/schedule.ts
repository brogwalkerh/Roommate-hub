// Request checks, prompt and answer clean-up for the parse-schedule function.
// Pure, so it can be unit tested.

/** What the browser sends: the file as base64 (PDF, image) or as text (spreadsheets as CSV). */
export type ScheduleSource =
  | { type: 'pdf'; media_type: 'application/pdf'; data: string }
  | { type: 'image'; media_type: ImageType; data: string }
  | { type: 'text'; data: string }

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export type ParseRequest = {
  source: ScheduleSource
  filename: string
  /** The person's local date, "yyyy-mm-dd": resolves "Monday" or a date with no year. */
  today: string
  /** Week to place a schedule on when it names weekdays but no dates, "yyyy-mm-dd" (a Monday). */
  weekOf: string | null
  /** Whose row to read on a schedule that lists several people; null reads everything. */
  person: string | null
}

/** One event as the app receives it. Times are local wall-clock times. */
export type ParsedEvent = {
  title: string
  /** "yyyy-mm-dd" */
  date: string
  /** Last day (inclusive) for an all-day event that spans several days, else equal to date. */
  endDate: string
  allDay: boolean
  /** "HH:MM", 24-hour. Empty for all-day events. */
  startTime: string
  /** "HH:MM", 24-hour. Empty for all-day events. Earlier than startTime means it ends the next day. */
  endTime: string
  location: string
  notes: string
  /** An OFF / leave / holiday entry rather than somewhere to be. */
  dayOff: boolean
  /** The schedule's word for the end when it isn't a time ("close", "CL"); "" otherwise. */
  endLabel: string
}

export const MAX_PDF_BYTES = 10 * 1024 * 1024
/** The Claude API limit for one base64 image. The app shrinks photos well below this. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_TEXT_CHARS = 200_000
export const MAX_EVENTS = 300
const TITLE_MAX = 200
const TEXT_MAX = 500

const IMAGE_TYPES: ImageType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

/** Decoded size of a base64 string. */
export function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.floor((data.length * 3) / 4) - padding
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Returns the cleaned request, or an error code the app turns into a sentence. */
export function validateParseRequest(body: unknown): { ok: true; value: ParseRequest } | { ok: false; error: string } {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const s = (typeof b.source === 'object' && b.source !== null ? b.source : {}) as Record<string, unknown>
  const data = typeof s.data === 'string' ? s.data : ''
  const today = typeof b.today === 'string' ? b.today : ''
  const weekOf = typeof b.week_of === 'string' && b.week_of !== '' ? b.week_of : null
  const filename = (typeof b.filename === 'string' ? b.filename : '').slice(0, 200)
  const person = typeof b.person === 'string' ? b.person.replace(/\s+/g, ' ').trim().slice(0, 80) : ''

  if (!isRealDate(today)) return { ok: false, error: 'invalid_request' }
  if (weekOf !== null && !isRealDate(weekOf)) return { ok: false, error: 'invalid_request' }
  if (data === '') return { ok: false, error: 'unsupported_file' }

  let source: ScheduleSource
  if (s.type === 'pdf' && s.media_type === 'application/pdf') {
    if (!BASE64_RE.test(data)) return { ok: false, error: 'unsupported_file' }
    if (base64Bytes(data) > MAX_PDF_BYTES) return { ok: false, error: 'file_too_large' }
    source = { type: 'pdf', media_type: 'application/pdf', data }
  } else if (s.type === 'image' && IMAGE_TYPES.includes(s.media_type as ImageType)) {
    if (!BASE64_RE.test(data)) return { ok: false, error: 'unsupported_file' }
    if (base64Bytes(data) > MAX_IMAGE_BYTES) return { ok: false, error: 'file_too_large' }
    source = { type: 'image', media_type: s.media_type as ImageType, data }
  } else if (s.type === 'text') {
    if (data.length > MAX_TEXT_CHARS) return { ok: false, error: 'file_too_large' }
    source = { type: 'text', data }
  } else {
    return { ok: false, error: 'unsupported_file' }
  }
  return { ok: true, value: { source, filename, today, weekOf, person: person || null } }
}

/** JSON schema for the structured output. Every field is required; "" stands for "none". */
export const SCHEDULE_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name, e.g. "Work", "Dentist", "Shift at Café Rio"' },
          date: { type: 'string', description: 'Start date, YYYY-MM-DD' },
          end_date: {
            type: 'string',
            description: 'Last day (inclusive) of an all-day event that spans several days, YYYY-MM-DD; "" otherwise',
          },
          all_day: { type: 'boolean' },
          start_time: { type: 'string', description: '24-hour HH:MM; "" for all-day events' },
          end_time: { type: 'string', description: '24-hour HH:MM; "" if the schedule gives no end time or ends with a word like "close"' },
          end_label: {
            type: 'string',
            description: 'When the end is a word rather than a time ("close", "CL", "till done"), that word as written; "" otherwise',
          },
          location: { type: 'string', description: 'Place or room if given, else ""' },
          notes: { type: 'string', description: 'Other useful details from the schedule (role, station, reference), else ""' },
          day_off: {
            type: 'boolean',
            description: 'true for a day off, leave or holiday entry (OFF, REQ OFF, PTO, vacation, bank holiday); false for a shift, class or appointment',
          },
        },
        required: ['title', 'date', 'end_date', 'all_day', 'start_time', 'end_time', 'end_label', 'location', 'notes', 'day_off'],
        additionalProperties: false,
      },
    },
    warnings: {
      type: 'array',
      description: 'Short notes for the person about anything ambiguous or skipped',
      items: { type: 'string' },
    },
  },
  required: ['events', 'warnings'],
  additionalProperties: false,
} as const

export const SYSTEM_PROMPT = `You read a person's schedule (a work rota, class timetable, shift plan, appointment list or similar) and list each scheduled item as a calendar event for a shared household calendar app.

Rules:
- One event per occurrence. If the schedule shows a repeating pattern over a date range (for example "Mon-Fri 9-5, Oct 20 to Oct 31"), list each day separately.
- Use 24-hour HH:MM times. If an item has a start but no end time, leave end_time empty. A shift that ends after midnight keeps its real end time (e.g. 22:00 to 06:00).
- If the end is a word instead of a time ("4-close", "4-CL", "till done"), leave end_time empty and put that word in end_label exactly as written. Never guess a closing time.
- Mark days off, leave and holidays (OFF, REQ OFF, PTO, vacation) as all-day events with day_off true, but only when the schedule names them explicitly; skip blank cells. Codes you cannot interpret (e.g. "HW", "MLA") go in notes with day_off false, and get a warning.
- Keep titles short and natural ("Work", "Chemistry lecture", "Night shift", "Day off"). Put extra details such as role, station or room in location or notes.
- Times like "2:30P-11:00P" mean 14:30 to 23:00; "9:00-4:00A" means 21:00 to 04:00 the next morning.
- If the schedule covers several people and the instructions name one of them, include only that person's row or column and nothing else. If no person is named, include only rows that clearly belong to the schedule's owner when that is obvious; otherwise include everything and add a warning.
- Never invent items. If something is unreadable or ambiguous, skip it or include your best reading and say so in warnings.`

/** The instruction sent with the file. */
export function buildUserPrompt(req: Pick<ParseRequest, 'today' | 'weekOf' | 'filename' | 'person'>): string {
  const lines = [
    `Today is ${req.today}. Resolve dates without a year to the nearest sensible year around today.`,
    req.weekOf
      ? `If the schedule names weekdays but no dates, place them in the week starting Monday ${req.weekOf}.`
      : 'If the schedule names weekdays but no dates, place them in the week starting on the Monday on or after today.',
  ]
  if (req.person) {
    lines.push(
      `The schedule may list several people. Include only the items for "${req.person}". Match the name loosely: first name, surname, nickname, initials or different capitalization. Leave out every other person's rows. If no row or column belongs to that person, return no events and explain in warnings.`,
    )
  }
  if (req.filename) lines.push(`The file is named "${req.filename}".`)
  lines.push('List the events in this schedule.')
  return lines.join('\n')
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/**
 * Turn the model's answer into events the app can show. Drops entries with no
 * title or an impossible date, fixes small mistakes (an all-day event with
 * times, an end date before the start), and caps the count.
 */
export function normalizeEvents(raw: unknown): { events: ParsedEvent[]; warnings: string[]; dropped: number } {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const items = Array.isArray(r.events) ? r.events : []
  const warnings = (Array.isArray(r.warnings) ? r.warnings : [])
    .map((w) => clean(w, TEXT_MAX))
    .filter((w) => w !== '')
    .slice(0, 10)

  const events: ParsedEvent[] = []
  let dropped = 0
  for (const item of items) {
    const e = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
    const title = clean(e.title, TITLE_MAX)
    const date = clean(e.date, 10)
    if (title === '' || !isRealDate(date)) {
      dropped++
      continue
    }
    const startTime = clean(e.start_time, 5)
    const endTime = clean(e.end_time, 5)
    const hasStart = TIME_RE.test(startTime)
    const dayOff = e.day_off === true
    const allDay = dayOff || e.all_day === true || !hasStart
    const endDate = clean(e.end_date, 10)
    const hasEnd = !allDay && TIME_RE.test(endTime)
    events.push({
      title,
      date,
      endDate: allDay && isRealDate(endDate) && endDate >= date ? endDate : date,
      allDay,
      startTime: allDay ? '' : startTime,
      endTime: hasEnd ? endTime : '',
      location: clean(e.location, TEXT_MAX),
      notes: clean(e.notes, TEXT_MAX),
      dayOff,
      endLabel: allDay || hasEnd ? '' : clean(e.end_label, 20),
    })
  }

  events.sort((a, b) => (a.date + (a.startTime || '00:00')).localeCompare(b.date + (b.startTime || '00:00')))
  if (events.length > MAX_EVENTS) {
    warnings.push(`Only the first ${MAX_EVENTS} events are shown.`)
    dropped += events.length - MAX_EVENTS
    events.length = MAX_EVENTS
  }
  return { events, warnings, dropped }
}
