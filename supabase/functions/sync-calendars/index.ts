// Fetch every connected calendar (Airbnb export link, personal iCal links)
// and replace its rows in feed_events. Runs every 30 minutes from pg_cron,
// and on demand when someone taps "Sync now" in Settings.
//
// Error messages saved for the app must never include the feed URL (it holds a
// secret token), so only messages written here (FeedError) are shown as-is.
import ICAL from 'npm:ical.js@2.2.1'
import { adminClient, authorize, cors, json } from '../_shared/http.ts'
import { parseIcs } from '../_shared/ics.ts'
import { checkFeedUrl, isPrivateAddress } from '../_shared/url.ts'

const DAY = 24 * 60 * 60 * 1000
const MAX_BYTES = 5_000_000

type Feed = { id: string; name: string; url: string; privacy: 'details' | 'busy' }

/** An error whose message is safe to show (it never contains the URL). */
class FeedError extends Error {}

/** Resolve the host and refuse private addresses, when the runtime allows DNS lookups. */
async function checkResolvedHost(url: URL) {
  const resolve = (Deno as unknown as { resolveDns?: (h: string, t: 'A' | 'AAAA') => Promise<string[]> }).resolveDns
  if (!resolve) return
  const host = url.hostname.replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (/^[\d.]+$/.test(host) || host.includes(':')) return // already checked as a literal
  const addresses = (
    await Promise.all([resolve(host, 'A').catch(() => []), resolve(host, 'AAAA').catch(() => [])])
  ).flat()
  if (addresses.some(isPrivateAddress)) throw new FeedError('That calendar link points to a private network address.')
}

/** fetch() that re-checks every redirect hop, so a link can't bounce to a private address. */
async function fetchChecked(url: string, hops = 0): Promise<Response> {
  const problem = checkFeedUrl(url)
  if (problem) throw new FeedError(problem)
  const target = new URL(url.replace(/^webcal:\/\//i, 'https://'))
  await checkResolvedHost(target)
  const res = await fetch(target, {
    headers: { 'User-Agent': 'RoommateHub/1.0 calendar sync', Accept: 'text/calendar, */*;q=0.5' },
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel()
    const location = res.headers.get('location')
    if (!location || hops >= 4) throw new FeedError('The calendar link redirected too many times.')
    return fetchChecked(new URL(location, target).toString(), hops + 1)
  }
  return res
}

/** Read the body with a hard size cap, whatever Content-Length says. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel()
      throw new FeedError('That calendar is too large to sync (over 5 MB).')
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer())
}

async function fetchCalendar(url: string): Promise<string> {
  const res = await fetchChecked(url)
  if (res.status === 404 || res.status === 410) throw new FeedError('The calendar link no longer works. Copy a fresh link and paste it again.')
  if (res.status === 401 || res.status === 403) throw new FeedError('The calendar service refused the link. Copy a fresh link and paste it again.')
  if (!res.ok) throw new FeedError(`The calendar service answered with an error (HTTP ${res.status}). It will retry automatically.`)
  const text = await readCapped(res)
  if (!text.includes('BEGIN:VCALENDAR')) throw new FeedError("That link didn't return a calendar file. Check that you copied the export (.ics) link.")
  return text
}

function safeMessage(err: unknown): string {
  if (err instanceof FeedError) return err.message
  const name = (err as Error | undefined)?.name
  if (name === 'TimeoutError' || name === 'AbortError') return 'The calendar service took too long to answer. It will retry automatically.'
  return 'Couldn’t read this calendar right now. It will retry automatically.'
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
  if (error) return json({ error: 'Couldn’t load the calendars.' }, 500)

  const now = Date.now()
  const windowStart = new Date(now - 60 * DAY)
  const windowEnd = new Date(now + 400 * DAY)

  // One at a time, saving each result, so a problem with one calendar can't
  // stop the others from updating.
  const results: { id: string; ok: boolean; events?: number; error?: string }[] = []
  for (const feed of (feeds ?? []) as Feed[]) {
    try {
      const text = await fetchCalendar(feed.url)
      const rows = parseIcs(ICAL, text, { windowStart, windowEnd, privacy: feed.privacy })
      const { error } = await admin.rpc('replace_feed_events', { p_feed_id: feed.id, p_events: rows })
      if (error) throw new FeedError('Couldn’t save this calendar’s events. It will retry automatically.')
      results.push({ id: feed.id, ok: true, events: rows.length })
    } catch (err) {
      const message = safeMessage(err)
      // Log the error type only: the raw message can contain the secret URL.
      console.error('sync failed', feed.id, (err as Error | undefined)?.name ?? typeof err)
      // Keep the last good events; just record the problem.
      await admin.rpc('replace_feed_events', { p_feed_id: feed.id, p_events: [], p_error: message })
      results.push({ id: feed.id, ok: false, error: message })
    }
  }

  return json({ results })
})
