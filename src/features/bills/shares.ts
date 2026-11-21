// Who owes what on each bill. Pure helpers over the bill_debts view, so the
// rules (what counts as paid, how a settle-up is spread across bills) are
// tested without a browser.

/** A bill_debts row: `user_id` owes `payer_id` their share of a bill. */
export type BillDebt = {
  bill_id: string
  title: string
  due_on: string | null
  paid_on: string | null
  created_at: string
  payer_id: string
  user_id: string
  share_cents: number
  /** What they have paid back on this bill so far. */
  paid_cents: number
  /** The date of their latest payment on it, or null. */
  paid_back_on: string | null
}

export type ShareStatus = 'unpaid' | 'partly' | 'paid'

/** Paid once the whole share is covered; partly when some of it is. */
export function shareStatus(debt: Pick<BillDebt, 'share_cents' | 'paid_cents'>): ShareStatus {
  if (debt.paid_cents <= 0) return 'unpaid'
  return debt.paid_cents >= debt.share_cents ? 'paid' : 'partly'
}

/** What is still owed on this share, never below zero. */
export function owedCents(debt: Pick<BillDebt, 'share_cents' | 'paid_cents'>): number {
  return Math.max(0, debt.share_cents - debt.paid_cents)
}

/** The debts on one bill, in household order of who owes. */
export function debtsForBill<D extends Pick<BillDebt, 'bill_id'>>(debts: readonly D[], billId: string): D[] {
  return debts.filter((d) => d.bill_id === billId)
}

/** Debts `from` still owes `to`, oldest bill first. */
export function openDebts<D extends BillDebt>(debts: readonly D[], from: string, to: string): D[] {
  return debts
    .filter((d) => d.user_id === from && d.payer_id === to && owedCents(d) > 0)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.bill_id.localeCompare(b.bill_id)))
}

export type SettlementPlan = {
  /** Bills this payment covers in full, oldest first. */
  covered: { bill_id: string; title: string; amount_cents: number }[]
  /** Money left after the covered bills, recorded as a payment not tied to a bill. */
  remainderCents: number
}

/**
 * Spread a payment across what the payer owes, oldest bill first. A bill is
 * only covered when the payment reaches the whole of what is still owed on
 * it, so each bill is either paid or not. What is left over (a partial
 * payment, or more than was owed) is one payment not tied to any bill.
 */
export function planSettlement(amountCents: number, debts: readonly BillDebt[]): SettlementPlan {
  const covered: SettlementPlan['covered'] = []
  let remaining = amountCents
  for (const debt of debts) {
    const owed = owedCents(debt)
    if (owed === 0 || owed > remaining) continue
    covered.push({ bill_id: debt.bill_id, title: debt.title, amount_cents: owed })
    remaining -= owed
  }
  return { covered, remainderCents: remaining }
}
