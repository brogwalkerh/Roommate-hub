/** Turn a Supabase/Postgres/network error into a sentence a person can act on. */
export function friendlyError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)

  if (/signup_not_allowed|Database error saving new user/i.test(message)) {
    return 'This app is private. Only the two household emails can create an account.'
  }
  if (/Invalid login credentials/i.test(message)) return 'That email and password don’t match.'
  if (/Email not confirmed/i.test(message)) {
    return 'Confirm your email first. Check your inbox for the link we sent.'
  }
  if (/User already registered/i.test(message)) return 'That email already has an account. Sign in instead.'
  if (/Password should be at least/i.test(message)) return 'Use a password with at least 8 characters.'
  if (/rate limit|too many requests/i.test(message)) return 'Too many attempts. Wait a minute and try again.'
  if (/shares_mismatch/i.test(message)) return 'The split doesn’t add up to the bill total.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'Can’t reach the server. Check your connection and try again.'
  }
  if (/The object exceeded the maximum allowed size|Payload too large/i.test(message)) {
    return 'That file is over the 50 MB limit.'
  }
  if (/JWT expired|invalid JWT/i.test(message)) return 'Your session expired. Sign in again.'
  return message || 'Something went wrong. Try again.'
}

/** Throw Supabase `{ error }` results so React Query sees them as failures. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error
  return result.data
}
