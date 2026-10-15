// Shared helpers for Edge Functions: CORS, JSON responses, auth.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Service-role client. Bypasses RLS, so only use it after authorize(). */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type Caller = { kind: 'cron' } | { kind: 'member'; userId: string }

function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/**
 * Who is calling: the database scheduler (x-cron-secret header) or a
 * confirmed household member (their access token). Anything else is null.
 */
export async function authorize(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const cronSecret = Deno.env.get('CRON_SECRET')
  const presented = req.headers.get('x-cron-secret')
  if (cronSecret && presented && constantTimeEqual(presented, cronSecret)) return { kind: 'cron' }

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user?.email_confirmed_at) return null
  const { data: profile } = await admin.from('profiles').select('id').eq('id', data.user.id).maybeSingle()
  return profile ? { kind: 'member', userId: data.user.id } : null
}
