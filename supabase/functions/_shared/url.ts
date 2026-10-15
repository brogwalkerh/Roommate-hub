// Guard for fetching calendar links that people paste in: public HTTPS hosts only.

const PRIVATE_HOST = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.internal$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
]

/** Returns an error sentence, or null when the URL is OK to fetch. */
export function checkFeedUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.replace(/^webcal:\/\//i, 'https://'))
  } catch {
    return "That doesn't look like a web address."
  }
  if (url.protocol !== 'https:') return 'The calendar link must start with https:// or webcal://.'
  if (url.username || url.password) return 'Calendar links with a username or password are not supported.'
  if (PRIVATE_HOST.some((re) => re.test(url.hostname))) return 'That calendar link points to a private network address.'
  return null
}
