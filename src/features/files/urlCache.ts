// Signed-URL memory for thumbnails. Pure, so it is tested without Supabase.

/** Remembers signed URLs so a refetch hands back the same URL and thumbnails don't reload. */
export function createSignedUrlCache(now: () => number = Date.now, minRemainingMs = 20 * 60_000) {
  const entries = new Map<string, { url: string; expiresAt: number }>()
  return {
    /** The saved URL, or undefined when none is saved or it expires within `minRemainingMs`. */
    get(path: string): string | undefined {
      const entry = entries.get(path)
      if (!entry) return undefined
      if (entry.expiresAt - now() < minRemainingMs) {
        entries.delete(path)
        return undefined
      }
      return entry.url
    },
    set(path: string, url: string, ttlSeconds: number) {
      entries.set(path, { url, expiresAt: now() + ttlSeconds * 1000 })
    },
    clear() {
      entries.clear()
    },
  }
}
