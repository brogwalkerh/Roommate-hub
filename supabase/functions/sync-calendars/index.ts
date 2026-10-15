// Fetch every connected calendar (Airbnb export link, personal iCal links)
// and replace its rows in feed_events. Runs every 30 minutes from pg_cron,
// and on demand when someone taps "Sync now" in Settings.
import ICAL from 'npm:ical.js@2.2.1'
import { adminClient, authorize, cors, json } from '../_shared/http.ts'
import { parseIcs } from '../_shared/ics.ts'
import { checkFeedUrl } from '../_shared/url.ts'

const DAY = 24 * 60 * 60 * 1000
const MAX_BYTES = 5_000_000

type Feed = { id: string; name: string; url: string; privacy: 'details' | 'busy' }

/** fetch() that re-checks every redirect hop, so a link can't bounce to a private address. */
async function fetchChecked(url: string, hops = 0): Promise<Response> {
  const problem = checkFeedUrl(url)
  if (problem) throw new Error(problem)
  const res = await fetch(url.replace(/^webcal:\/\//i, 'https://'), {
    headers: { 'User-Agent': 'RoommateHub/1.0 calendar sync', Accept: 'text/calendar, */*;q=0.5' },
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location')
    if (!location || hops >= 4) throw new Error('The calendar link redirected too many times.')
    return fetchChecked(new URL(location, url).toString(), hops + 1)
  }
  return res
}

async function fetchCalendar(url: string): Promise<string> {
  const res = await fetchChecked(url)
  if (res.status === 404 || res.status === 410) throw new Error('The calendar link no longer works. Copy a fresh link and paste it again.')
  if (res.status === 401 || res.status === 403) throw new Error('The calendar service refused the link. Copy a fresh link and paste it again.')
  if (!res.ok) throw new Error(`The calendar service answered with an error (HTTP ${res.status}). It will retry automatically.`)
  const length = Number(res.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) throw new Error('That calendar is too large to sync (over 5 MB).')
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new Error('That calendar is too large to sync (over 5 MB).')
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error("That link didn't return a calendar file. Check that you copied the export (.ics) link.")
  return text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = adminClient()
  const caller = await authorize(req, admin)
  if (!caller) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json().catch(() => ({}))) as { feedId?: string }
  let query = admin.from('calendar_feeds').select('id, name, url, privacy')
  if (body.feedId) query = query.eq('id', body.feedId)
  const { data: feeds, error } = await query
  if (error) return json({ error: error.message }, 500)

  const now = Date.now()
  const windowStart = new Date(now - 60 * DAY)
  const windowEnd = new Date(now + 400 * DAY)

  const results = await Promise.all(
    (feeds as Feed[]).map(async (feed) => {
      try {
        const text = await fetchCalendar(feed.url)
        const rows = parseIcs(ICAL, text, { windowStart, windowEnd, privacy: feed.privacy })
        const { error } = await admin.rpc('replace_feed_events', { p_feed_id: feed.id, p_events: rows })
        if (error) throw new Error(error.message)
        return { id: feed.id, ok: true, events: rows.length }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Keep the last good events; just record the problem.
        await admin.rpc('replace_feed_events', { p_feed_id: feed.id, p_events: [], p_error: message.slice(0, 300) })
        return { id: feed.id, ok: false, error: message }
      }
    }),
  )

  return json({ results })
})
