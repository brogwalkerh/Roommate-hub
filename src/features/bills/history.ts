// History tab: paid bills and settle-up payments, newest first, grouped by month.

import { format } from 'date-fns'
import { parseDateOnly } from '../../lib/dates'

type PaidBillLike = { paid_on: string | null; amount_cents: number; created_at: string }
type SettlementLike = { paid_on: string; amount_cents: number; created_at: string }

export type HistoryEntry<B, S> =
  | { kind: 'bill'; date: string; item: B }
  | { kind: 'settlement'; date: string; item: S }

export type HistoryMonth<B, S> = {
  /** "2026-10" */
  key: string
  /** "October 2026" */
  label: string
  entries: HistoryEntry<B, S>[]
  /** Sum of the month's paid bills. Settle-ups move money between you, so they don't count. */
  billsTotalCents: number
  /** Sum of the viewer's shares of those bills. */
  myShareCents: number
  /** Sum of settle-up payments in the month. */
  settledCents: number
}

/**
 * Interleave paid bills and settlements by date (newest first; same day: most
 * recently added first) and group them by calendar month with totals.
 * Unpaid bills are ignored.
 */
export function groupHistory<B extends PaidBillLike, S extends SettlementLike>(
  bills: readonly B[],
  settlements: readonly S[],
  myShare: (bill: B) => number = () => 0,
): HistoryMonth<B, S>[] {
  const entries: (HistoryEntry<B, S> & { createdAt: string })[] = [
    ...bills.flatMap((bill) =>
      bill.paid_on ? [{ kind: 'bill' as const, date: bill.paid_on, item: bill, createdAt: bill.created_at }] : [],
    ),
    ...settlements.map((s) => ({ kind: 'settlement' as const, date: s.paid_on, item: s, createdAt: s.created_at })),
  ]
  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return a.kind === b.kind ? 0 : a.kind === 'bill' ? -1 : 1
  })

  const months: HistoryMonth<B, S>[] = []
  for (const { createdAt: _createdAt, ...entry } of entries) {
    const key = entry.date.slice(0, 7)
    let month = months.at(-1)
    if (!month || month.key !== key) {
      month = {
        key,
        label: format(parseDateOnly(`${key}-01`), 'MMMM yyyy'),
        entries: [],
        billsTotalCents: 0,
        myShareCents: 0,
        settledCents: 0,
      }
      months.push(month)
    }
    month.entries.push(entry as HistoryEntry<B, S>)
    if (entry.kind === 'bill') {
      month.billsTotalCents += entry.item.amount_cents
      month.myShareCents += myShare(entry.item)
    } else {
      month.settledCents += entry.item.amount_cents
    }
  }
  return months
}
