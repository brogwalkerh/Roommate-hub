// Sentences the Bills page shows, written from the viewer's point of view.

import { formatCents } from '../../lib/money'
import type { Share, SplitType } from './split'

type PersonLookup = (id: string | null | undefined) => { display_name: string } | null

/** "You" / "you" for the viewer, otherwise their name ("Your roommate" if unknown). */
export function personName(id: string | null | undefined, myId: string | null | undefined, byId: PersonLookup, capitalize = true): string {
  if (id && id === myId) return capitalize ? 'You' : 'you'
  return byId(id)?.display_name ?? (capitalize ? 'Your roommate' : 'your roommate')
}

/** "Sam paid you", "You paid Sam". */
export function settlementSentence(
  settlement: { from_user: string; to_user: string },
  myId: string | null | undefined,
  byId: PersonLookup,
): string {
  return `${personName(settlement.from_user, myId, byId)} paid ${personName(settlement.to_user, myId, byId, false)}`
}

/** "Split equally", "Exact amounts: Alex $1,000.00, Sam $800.00", "Alex 60%, Sam 40%". */
export function describeSplit(split: SplitType, shares: readonly Share[] | null, byId: PersonLookup): string {
  if (split === 'equal' || !shares || shares.length === 0) return 'Split equally'
  const name = (id: string) => byId(id)?.display_name ?? 'Someone'
  if (split === 'percent') {
    return shares.map((s) => `${name(s.user_id)} ${s.percent ?? 0}%`).join(', ')
  }
  return shares.map((s) => `${name(s.user_id)} ${formatCents(s.share_cents)}`).join(', ')
}

/** Option labels for lead_days. */
export function describeLeadDays(days: number): string {
  if (days === 0) return 'On the day it’s due'
  if (days === 1) return '1 day before it’s due'
  return `${days} days before it’s due`
}

type DebtLike = { user_id: string; payer_id: string; share_cents: number; paid_cents: number; paid_back_on: string | null }

/**
 * One person's share of a bill, from the viewer's side:
 * "Sam owes you $42.10", "You owe Sam $42.10", "Sam has paid $20.00 of $42.10",
 * "Sam paid you back Fri, Oct 17", "You paid Sam back Fri, Oct 17".
 */
export function debtSentence(
  debt: DebtLike,
  myId: string | null | undefined,
  byId: PersonLookup,
  formatDate: (date: string) => string,
): string {
  const owes = personName(debt.user_id, myId, byId)
  const owed = personName(debt.payer_id, myId, byId, false)
  const share = formatCents(debt.share_cents)
  if (debt.paid_cents >= debt.share_cents) {
    const when = debt.paid_back_on ? ` ${formatDate(debt.paid_back_on)}` : ''
    return `${owes} paid ${owed} back${when}`
  }
  if (debt.paid_cents > 0) {
    const has = debt.user_id === myId ? 'have' : 'has'
    return `${owes} ${has} paid ${formatCents(debt.paid_cents)} of ${share}`
  }
  const verb = debt.user_id === myId ? 'owe' : 'owes'
  return `${owes} ${verb} ${owed} ${share}`
}

/** The button that records a share as paid: "I paid" for the viewer, "Sam paid" otherwise. */
export function paidShareLabel(userId: string, myId: string | null | undefined, byId: PersonLookup): string {
  return userId === myId ? 'I paid' : `${personName(userId, myId, byId)} paid`
}
