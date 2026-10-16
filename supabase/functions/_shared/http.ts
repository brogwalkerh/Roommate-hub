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

function secretKey(): string | undefined {
  // New-style secret keys come as a JSON dictionary; fall back to the legacy service_role key.
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    if (keys.default) return keys.default
  } catch {
    // Not set or not JSON: try the legacy variable.
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? undefined
}

/** Admin client. Bypasses RLS, so only use it after authorize(). */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = secretKey()
  if (!url || !key) throw new Error('SUPABASE_URL or a secret key is not set')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const secretCache = new Map<string, string | null>()

/**
 * A function secret: an Edge Function environment variable if set (e.g. CRON_SECRET),
 * otherwise the matching Vault entry (e.g. cron_secret) via the function_secret RPC.
 */
export async function getSecret(admin: SupabaseClient, name: string): Promise<string | null> {
  const fromEnv = Deno.env.get(name.toUpperCase())
  if (fromEnv) return fromEnv
  if (secretCache.has(name)) return secretCache.get(name) ?? null
  const { data, error } = await admin.rpc('function_secret', { p_name: name })
  const value = error ? null : ((data as string | null) ?? null)
  if (!error) secretCache.set(name, value)
  return value
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
  const presented = req.headers.get('x-cron-secret')
  if (presented) {
    const cronSecret = await getSecret(admin, 'cron_secret')
    if (cronSecret && constantTimeEqual(presented, cronSecret)) return { kind: 'cron' }
  }

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user?.email_confirmed_at) return null
  const { data: profile } = await admin.from('profiles').select('id').eq('id', data.user.id).maybeSingle()
  return profile ? { kind: 'member', userId: data.user.id } : null
}
