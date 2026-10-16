// Send push notifications for reminders that came due, bills due today and
// Airbnb guest arrivals/departures. Runs every 5 minutes from pg_cron.
// A signed-in member can also POST { "test": true } to get a test notification.
import webpush from 'npm:web-push@3.6.7'
import { adminClient, authorize, cors, getSecret, json } from '../_shared/http.ts'
import { localDateHour, planNotifications, type Message, type Payload } from '../_shared/notify.ts'

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

// Reminders older than this are not announced, so a long outage doesn't cause a burst.
const CATCH_UP_MS = 6 * 60 * 60 * 1000

async function configureWebPush(admin: ReturnType<typeof adminClient>) {
  const [publicKey, privateKey, subject] = await Promise.all([
    getSecret(admin, 'vapid_public_key'),
    getSecret(admin, 'vapid_private_key'),
    getSecret(admin, 'vapid_subject'),
  ])
  if (!publicKey || !privateKey) throw new Error('VAPID keys are not configured')
  webpush.setVapidDetails(subject ?? 'https://brogwalkerh.github.io/Roommate-hub/', publicKey, privateKey)
}

async function deliver(
  admin: ReturnType<typeof adminClient>,
  userIds: string[],
  payload: Payload,
): Promise<{ sent: number; removed: number }> {
  const { data } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds)
  let sent = 0
  let removed = 0
  for (const sub of (data ?? []) as Subscription[]) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 60 * 60, urgency: 'normal' },
      )
      sent++
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      // The browser unsubscribed or the subscription expired: forget it.
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
        removed++
      } else {
        console.error('push failed', status, (err as Error).message)
      }
    }
  }
  return { sent, removed }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = adminClient()
  const caller = await authorize(req, admin)
  if (!caller) return json({ error: 'unauthorized' }, 401)

  try {
    await configureWebPush(admin)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }

  const body = (await req.json().catch(() => ({}))) as { test?: boolean }
  if (body.test) {
    if (caller.kind !== 'member') return json({ error: 'test_requires_member' }, 400)
    const result = await deliver(admin, [caller.userId], {
      title: 'Notifications are on',
      body: 'Reminders and bills due will show up here.',
      route: '#/settings',
      tag: 'test',
    })
    return json(result)
  }
  if (caller.kind !== 'cron') return json({ error: 'forbidden' }, 403)

  const now = new Date()
  const { data: household } = await admin.from('household').select('timezone').eq('id', 1).single()
  const timeZone = (household?.timezone as string | undefined) ?? 'America/Los_Angeles'
  const { date: today } = localDateHour(now, timeZone)

  const [profiles, reminders, bills, stays] = await Promise.all([
    admin.from('profiles').select('id, display_name, notify_reminders, notify_bills'),
    admin
      .from('reminders')
      .select('id, title, due_at, assignee_id')
      .is('completed_at', null)
      .lte('due_at', now.toISOString())
      .gte('due_at', new Date(now.getTime() - CATCH_UP_MS).toISOString()),
    admin
      .from('bills')
      .select('id, title, amount_cents, due_on, bill_shares(user_id, share_cents)')
      .is('paid_on', null)
      .eq('due_on', today),
    admin
      .from('feed_events')
      .select('uid, start_date, end_date, summary, calendar_feeds!inner(kind, name)')
      .eq('calendar_feeds.kind', 'airbnb')
      .eq('all_day', true)
      .or(`start_date.eq.${today},end_date.eq.${today}`),
  ])
  for (const r of [profiles, reminders, bills, stays]) {
    if (r.error) return json({ error: r.error.message }, 500)
  }

  const messages: Message[] = planNotifications({
    now,
    timeZone,
    profiles: profiles.data ?? [],
    dueReminders: reminders.data ?? [],
    billsDueToday: bills.data ?? [],
    stays: (stays.data ?? [])
      .filter((s) => /^reserved/i.test(String(s.summary ?? '')))
      .map((s) => ({
        uid: s.uid as string,
        start_date: s.start_date as string,
        end_date: s.end_date as string,
        feed_name: ((s.calendar_feeds as unknown as { name: string }) ?? { name: 'Airbnb' }).name,
      })),
  })

  // Claim each message in the log first; only messages not sent before come back.
  let sent = 0
  let removed = 0
  if (messages.length > 0) {
    const { data: claimed, error } = await admin
      .from('notification_log')
      .upsert(messages.map((m) => ({ key: m.key })), { onConflict: 'key', ignoreDuplicates: true })
      .select('key')
    if (error) return json({ error: error.message }, 500)
    const fresh = new Set((claimed ?? []).map((c) => c.key as string))
    for (const m of messages) {
      if (!fresh.has(m.key)) continue
      const r = await deliver(admin, m.userIds, m.payload)
      sent += r.sent
      removed += r.removed
    }
  }

  // Housekeeping: forget log entries after 60 days.
  await admin.from('notification_log').delete().lt('sent_at', new Date(now.getTime() - 60 * 86_400_000).toISOString())

  return json({ planned: messages.length, sent, removed })
})
