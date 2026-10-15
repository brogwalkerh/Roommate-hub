import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useToast } from '../components/ui/Toast'

/** Registers the service worker and offers a reload when a new version is deployed. */
export function UpdatePrompt() {
  const { toast } = useToast()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version every hour while the app stays open.
      if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })

  useEffect(() => {
    if (needRefresh) {
      toast('A new version is ready.', { action: { label: 'Reload', onClick: () => void updateServiceWorker(true) } })
    }
  }, [needRefresh, toast, updateServiceWorker])

  return null
}
