/** Turn a Supabase/Postgres/network error into a sentence a person can act on. */
export function friendlyError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)

  if (/already_registered/i.test(message)) return 'That email already has an account. Sign in instead.'
  if (/weak_password/i.test(message)) return 'Use a longer password: at least 12 characters.'
  if (/long_password/i.test(message)) return 'That password is too long. Use 72 characters or fewer.'
  if (/invalid_email/i.test(message)) return 'Check the email address.'
  if (/invalid_name/i.test(message)) return 'Enter your name (up to 40 characters).'
  if (/signup_not_allowed|Database error saving new user/i.test(message)) {
    return 'That email and invite code don’t match. Check the code, or ask whoever set up the app for a new one.'
  }
  // Schedule import (readScheduleFile and the parse-schedule function)
  if (/^unsupported_file$/.test(message)) return 'Pick a PDF, a photo or screenshot, or a spreadsheet (Excel, CSV).'
  if (/^unsupported_image$/.test(message)) {
    return 'This browser can’t open that photo. Take a screenshot of it, or export it as JPEG or PNG.'
  }
  if (/^file_too_large$/.test(message)) return 'That file is too big to read. PDFs and spreadsheets can be up to 10 MB.'
  if (/^empty_file$/.test(message)) return 'That file looks empty.'
  if (/^unreadable$/.test(message)) return 'Couldn’t read a schedule in that file. Try a clearer photo or a different file.'
  if (/^too_long$/.test(message)) return 'That schedule is too long to read in one go. Split it into smaller files.'
  if (/^ai_not_configured$/.test(message)) return 'Schedule import isn’t set up yet: the app needs its Anthropic API key.'
  if (/^ai_busy$/.test(message)) return 'The schedule reader is busy. Try again in a minute.'
  if (/^import_limit$/.test(message)) return 'You’ve imported a lot of schedules today. Try again tomorrow.'
  if (/Invalid login credentials/i.test(message)) return 'That email and password don’t match.'
  if (/Email not confirmed/i.test(message)) {
    return 'Confirm your email first. Check your inbox for the link we sent.'
  }
  if (/User already registered/i.test(message)) return 'That email already has an account. Sign in instead.'
  if (/Password should be at least/i.test(message)) return 'Use a longer password: at least 12 characters.'
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
