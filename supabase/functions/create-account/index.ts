// Create a household account without a confirmation email.
// The database trigger enforce_signup_allowlist still checks that the email is
// on the allowlist and that the invite code matches, and burns the code.
// Because the invite code proves the person was invited, the account is
// created already confirmed, so Supabase's built-in email (which only reaches
// members of the Supabase organization) never needs to send anything.
import { adminClient, cors, json } from '../_shared/http.ts'
import { validateSignup } from '../_shared/signup.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const parsed = validateSignup(await req.json().catch(() => null))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const { email, password, display_name, invite_code } = parsed.value

  const admin = adminClient()
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name, invite_code },
  })

  if (error) {
    const message = error.message ?? ''
    if (/already (been )?registered|already exists/i.test(message)) return json({ error: 'already_registered' }, 409)
    // The allowlist trigger rejects the insert; Auth reports it as a database error.
    if (/database error|signup_not_allowed/i.test(message)) return json({ error: 'signup_not_allowed' }, 403)
    if (/password/i.test(message)) return json({ error: 'weak_password' }, 400)
    console.error('create-account failed', error.status, error.code)
    return json({ error: 'server_error' }, 500)
  }
  return json({ ok: true })
})
