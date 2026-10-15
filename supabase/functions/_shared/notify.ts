// Decide which push notifications to send. Pure, so it can be unit tested;
// the send-notifications function does the database reads and the sending.

export type ProfileRow = { id: string; display_name: string; notify_reminders: boolean; notify_bills: boolean }
export type ReminderRow = { id: string; title: string; due_at: string; assignee_id: string | null }
export type BillRow = {
  id: string
  title: string
  amount_cents: number
  due_on: string
  bill_shares: { user_id: string; share_cents: number }[]
}
export type StayRow = { uid: string; start_date: string; end_date: string; feed_name: string }

export type Payload = { title: string; body?: string; route: string; tag: string }
export type Message = { key: string; userIds: string[]; payload: Payload }

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const money = (cents: number) => usd.format(cents / 100)

/** Local date ("2026-10-15") and hour (0-23) for an instant in a time zone. */
export function localDateHour(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 }
}

function nights(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000)
}

/** Daily items (bills, guest arrivals) go out from this local hour on. */
export const MORNING_HOUR = 9

export function planNotifications(input: {
  now: Date
  timeZone: string
  profiles: ProfileRow[]
  /** Open reminders whose due time has passed (recent ones only). */
  dueReminders: ReminderRow[]
  /** Unpaid bills due today (local date). */
  billsDueToday: BillRow[]
  /** Airbnb guest stays starting or ending today (local date). */
  stays: StayRow[]
}): Message[] {
  const { now, timeZone, profiles } = input
  const { date: today, hour } = localDateHour(now, timeZone)
  const wantsReminders = profiles.filter((p) => p.notify_reminders).map((p) => p.id)
  const wantsBills = new Set(profiles.filter((p) => p.notify_bills).map((p) => p.id))
  const messages: Message[] = []

  for (const r of input.dueReminders) {
    const recipients = (r.assignee_id ? [r.assignee_id] : profiles.map((p) => p.id)).filter((id) => wantsReminders.includes(id))
    if (recipients.length === 0) continue
    messages.push({
      key: `reminder:${r.id}:${new Date(r.due_at).toISOString()}`,
      userIds: recipients,
      payload: {
        title: r.title,
        body: r.assignee_id ? 'Reminder' : 'Reminder for both of you',
        route: '#/reminders',
        tag: `reminder-${r.id}`,
      },
    })
  }

  if (hour >= MORNING_HOUR) {
    for (const b of input.billsDueToday) {
      if (b.due_on !== today) continue
      for (const p of profiles) {
        if (!wantsBills.has(p.id)) continue
        const share = b.bill_shares.find((s) => s.user_id === p.id)?.share_cents
        messages.push({
          key: `bill:${b.id}:${b.due_on}:${p.id}`,
          userIds: [p.id],
          payload: {
            title: `${b.title} is due today`,
            body: share !== undefined ? `${money(b.amount_cents)} total, your share is ${money(share)}` : money(b.amount_cents),
            route: '#/bills',
            tag: `bill-${b.id}`,
          },
        })
      }
    }

    for (const s of input.stays) {
      if (wantsReminders.length === 0) continue
      if (s.start_date === today) {
        const n = nights(s.start_date, s.end_date)
        messages.push({
          key: `checkin:${s.uid}:${s.start_date}`,
          userIds: wantsReminders,
          payload: {
            title: 'Guest checks in today',
            body: `${s.feed_name}: ${n} night${n === 1 ? '' : 's'}, checking out ${s.end_date}`,
            route: '#/schedule',
            tag: `checkin-${s.uid}`,
          },
        })
      }
      if (s.end_date === today) {
        messages.push({
          key: `checkout:${s.uid}:${s.end_date}`,
          userIds: wantsReminders,
          payload: { title: 'Guest checks out today', body: s.feed_name, route: '#/schedule', tag: `checkout-${s.uid}` },
        })
      }
    }
  }

  return messages
}
