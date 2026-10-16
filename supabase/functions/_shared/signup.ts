// Validation for the create-account function. Pure, so it can be unit tested.

export const MIN_PASSWORD = 12
// bcrypt (used by Supabase Auth) only reads the first 72 bytes of a password.
export const MAX_PASSWORD_BYTES = 72

export type SignupInput = { email: string; password: string; display_name: string; invite_code: string }

/** Returns the cleaned input, or an error code the app turns into a sentence. */
export function validateSignup(body: unknown): { ok: true; value: SignupInput } | { ok: false; error: string } {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
  const password = typeof b.password === 'string' ? b.password : ''
  const name = typeof b.display_name === 'string' ? b.display_name.trim() : ''
  const code = typeof b.invite_code === 'string' ? b.invite_code.trim().toUpperCase() : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: 'invalid_email' }
  if (password.length < MIN_PASSWORD) return { ok: false, error: 'weak_password' }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return { ok: false, error: 'long_password' }
  if (name.length < 1 || name.length > 40) return { ok: false, error: 'invalid_name' }
  if (code.length < 4 || code.length > 64) return { ok: false, error: 'signup_not_allowed' }
  return { ok: true, value: { email, password, display_name: name, invite_code: code } }
}
