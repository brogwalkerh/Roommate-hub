import { config } from '../lib/config'
import { supabase } from '../lib/supabase'

export type PushStatus =
  /** This browser can't do web push at all. */
  | 'unsupported'
  /** iPhone/iPad Safari: works only after "Add to Home Screen". */
  | 'needs-install'
  /** The person blocked notifications for this site. */
  | 'denied'
  /** Supported, not turned on for this device. */
  | 'off'
  | 'on'

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!supported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return (await currentSubscription()) ? 'on' : 'off'
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Ask permission, subscribe this device, and save the subscription for the server. */
export async function enablePush(): Promise<void> {
  if (!supported()) throw new Error('This browser can’t show notifications from web apps.')
  if (!config.vapidPublicKey) throw new Error('Notifications aren’t set up on the server yet.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser or phone settings.')

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(config.vapidPublicKey) }))
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('The browser returned an incomplete subscription.')

  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

/** Unsubscribe this device and forget it on the server. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestNotification(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ sent: number }>('send-notifications', { body: { test: true } })
  if (error) throw error
  if (!data || data.sent === 0) throw new Error('No device received it. Turn notifications off and on again on this device.')
}
