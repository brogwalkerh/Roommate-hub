import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every minute and whenever the app comes back to
 * the foreground, so "Today" and "Overdue" stay right on a screen left open.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const refresh = () => setNow(new Date())
    const id = window.setInterval(refresh, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])

  return now
}
