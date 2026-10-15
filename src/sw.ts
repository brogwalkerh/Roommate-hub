/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

// App shell: cached on install so the app opens instantly and offline.
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
clientsClaim()

/** Payload sent by the send-notifications Edge Function. */
type PushPayload = {
  title: string
  body?: string
  /** Hash route to open on tap, e.g. "#/reminders". */
  route?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = { title: 'Roommate Hub' }
  try {
    payload = event.data?.json() as PushPayload
  } catch {
    payload = { title: 'Roommate Hub', body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      data: { route: payload.route ?? '#/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route = (event.notification.data as { route?: string } | undefined)?.route ?? '#/'
  const target = new URL(self.registration.scope + route).toString()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus()
          if ('navigate' in client) await (client as WindowClient).navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
