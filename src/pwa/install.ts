import { useSyncExternalStore } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome/Edge/Android fire this early, so capture it at startup and offer it later in Settings.
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** Returns a function that shows the browser's install prompt, or null when none is available. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const available = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => deferred !== null,
  )
  if (!available) return null
  return async () => {
    const event = deferred
    if (!event) return
    await event.prompt()
    await event.userChoice
    deferred = null
    notify()
  }
}
