// Read a schedule (PDF, photo or spreadsheet text) with Claude and return the
// events it lists, for the app to show in a review step before anything is saved.
// Members call it with their access token; the scheduler secret also works, for
// checking the function from a terminal. Each member gets DAILY_LIMIT reads a day.
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0'
import { adminClient, authorize, cors, getSecret, json } from '../_shared/http.ts'
import { buildUserPrompt, normalizeEvents, SCHEDULE_SCHEMA, SYSTEM_PROMPT, validateParseRequest } from '../_shared/schedule.ts'

const MODEL = 'claude-sonnet-5-5'
const DAILY_LIMIT = 30

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = adminClient()
  const caller = await authorize(req, admin)
  if (!caller) return json({ error: 'unauthorized' }, 401)

  const parsed = validateParseRequest(await req.json().catch(() => null))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const request = parsed.value

  const apiKey = await getSecret(admin, 'anthropic_api_key')
  if (!apiKey) return json({ error: 'ai_not_configured' }, 503)

  if (caller.kind === 'member') {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count, error } = await admin
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', caller.userId)
      .gte('created_at', since)
    if (error) return json({ error: 'server_error' }, 500)
    if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'import_limit' }, 429)
    await admin.from('ai_usage').insert({ user_id: caller.userId, kind: 'parse_schedule' })
  }

  const source = request.source
  const fileBlock: Anthropic.Beta.BetaContentBlockParam =
    source.type === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: source.media_type, data: source.data } }
      : source.type === 'image'
        ? { type: 'image', source: { type: 'base64', media_type: source.media_type, data: source.data } }
        : { type: 'text', text: `<schedule>\n${source.data}\n</schedule>` }

  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 })
  let response: Anthropic.Beta.BetaMessage
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Re-run on another model if a safety classifier declines (Claude API only).
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEDULE_SCHEMA } },
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: buildUserPrompt(request) }] }],
    })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error('parse-schedule: Anthropic key rejected', err.status)
      return json({ error: 'ai_not_configured' }, 503)
    }
    if (err instanceof Anthropic.BadRequestError) {
      // Usually a file Claude can't open (encrypted or corrupt PDF, odd image).
      console.error('parse-schedule: bad request', err.message)
      return json({ error: 'unreadable' }, 422)
    }
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
      return json({ error: 'ai_busy' }, 503)
    }
    if (err instanceof Anthropic.APIConnectionTimeoutError) return json({ error: 'ai_busy' }, 504)
    console.error('parse-schedule failed', err instanceof Anthropic.APIError ? err.status : (err as Error).name)
    return json({ error: 'server_error' }, 500)
  }

  if (response.stop_reason === 'refusal') return json({ error: 'unreadable' }, 422)
  if (response.stop_reason === 'max_tokens') return json({ error: 'too_long' }, 422)

  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return json({ error: 'unreadable' }, 422)
  }
  const { events, warnings, dropped } = normalizeEvents(raw)
  if (dropped > 0) warnings.push(`Skipped ${dropped} ${dropped === 1 ? 'entry' : 'entries'} with no name or date.`)
  return json({ events, warnings })
})
