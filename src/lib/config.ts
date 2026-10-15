// Public, client-side configuration. Every value here is safe to publish:
// the Supabase publishable key and the VAPID public key are designed to be
// public. Data is protected by Row-Level Security, not by hiding these.
// Local overrides go in .env.local (VITE_SUPABASE_URL, ...).

const PRODUCTION = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabasePublishableKey: 'YOUR-PUBLISHABLE-KEY',
  vapidPublicKey: '',
}

export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? PRODUCTION.supabaseUrl,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? PRODUCTION.supabasePublishableKey,
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? PRODUCTION.vapidPublicKey,
  /** Absolute URL of the app, used for auth email links. */
  appUrl: new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
}
