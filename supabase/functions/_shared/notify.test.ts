import { localDateHour, planNotifications, type ProfileRow } from './notify'

const A: ProfileRow = { id: 'a', display_name: 'Alex', notify_reminders: true, notify_bills: true }
const B: ProfileRow = { id: 'b', display_name: 'Sam', notify_reminders: true, notify_bills: true }
const TZ = 'America/Los_Angeles'

describe('localDateHour', () => {
  it('converts to the household time zone', () => {
    // 2026-10-16 03:30 UTC is still Oct 15, 8:30 PM in Los Angeles (PDT).
    expect(localDateHour(new Date('2026-10-16T03:30:00Z'), TZ)).toEqual({ date: '2026-10-15', hour: 20 })
    expect(localDateHour(new Date('2026-10-16T07:05:00Z'), TZ)).toEqual({ date: '2026-10-16', hour: 0 })
  })
})

describe('planNotifications', () => {
  const morning = new Date('2026-10-15T17:00:00Z') // 10:00 AM PDT
  const early = new Date('2026-10-15T13:00:00Z') // 6:00 AM PDT
  const base = { timeZone: TZ, profiles: [A, B], dueReminders: [], billsDueToday: [], stays: [] }

  it('sends an assigned reminder only to the assignee, and a shared one to both', () => {
    const msgs = planNotifications({
      ...base,
      now: morning,
      dueReminders: [
        { id: 'r1', title: 'Trash out', due_at: '2026-10-15T16:00:00+00:00', assignee_id: 'b' },
        { id: 'r2', title: 'Water plants', due_at: '2026-10-15T16:30:00Z', assignee_id: null },
      ],
    })
    expect(msgs.map((m) => [m.key, m.userIds])).toEqual([
      ['reminder:r1:2026-10-15T16:00:00.000Z', ['b']],
      ['reminder:r2:2026-10-15T16:30:00.000Z', ['a', 'b']],
    ])
    expect(msgs[1].payload.body).toBe('Reminder for both of you')
  })

  it('respects notification preferences', () => {
    const msgs = planNotifications({
      ...base,
      now: morning,
      profiles: [A, { ...B, notify_reminders: false, notify_bills: false }],
      dueReminders: [{ id: 'r1', title: 'x', due_at: '2026-10-15T16:00:00Z', assignee_id: 'b' }],
      billsDueToday: [{ id: 'bill1', title: 'Rent', amount_cents: 240000, due_on: '2026-10-15', bill_shares: [] }],
    })
    expect(msgs.map((m) => m.key)).toEqual(['bill:bill1:2026-10-15:a'])
  })

  it('tells each person their share of a bill due today, after 9 AM local', () => {
    const bill = {
      id: 'bill1',
      title: 'Rent',
      amount_cents: 240001,
      due_on: '2026-10-15',
      bill_shares: [
        { user_id: 'a', share_cents: 120001 },
        { user_id: 'b', share_cents: 120000 },
      ],
    }
    expect(planNotifications({ ...base, now: early, billsDueToday: [bill] })).toEqual([])
    const msgs = planNotifications({ ...base, now: morning, billsDueToday: [bill] })
    expect(msgs).toHaveLength(2)
    expect(msgs[0].payload).toMatchObject({ title: 'Rent is due today', body: '$2,400.01 total, your share is $1,200.01' })
    expect(msgs[1].payload.body).toBe('$2,400.01 total, your share is $1,200.00')
  })

  it('announces guest check-ins and check-outs on the day', () => {
    const msgs = planNotifications({
      ...base,
      now: morning,
      stays: [
        { uid: 's1', start_date: '2026-10-15', end_date: '2026-10-18', feed_name: 'Spare room' },
        { uid: 's2', start_date: '2026-10-12', end_date: '2026-10-15', feed_name: 'Spare room' },
      ],
    })
    expect(msgs.map((m) => m.key)).toEqual(['checkin:s1:2026-10-15', 'checkout:s2:2026-10-15'])
    expect(msgs[0].payload.body).toBe('Spare room: 3 nights, checking out 2026-10-18')
  })
})
