// Bill splitting. Every amount is an integer number of cents, and every split
// adds up to the bill total exactly: no cent is lost or invented.
//
// Leftover-cent rules (deterministic, so both roommates' phones always agree):
// - equalSplit: the leftover cents go one each to the first members in the
//   order given. Callers pass members in household order (profiles sorted by
//   created_at, as useMembers returns them), never "me first".
// - percentSplit: largest-remainder method. Each person gets the floor of their
//   exact share; the leftover cents go one each to the largest fractional
//   remainders, and ties go to the person listed first.

import type { Enums, Json } from '../../lib/database.types'
import { centsToInput, formatCents, parseDollars } from '../../lib/money'

export type SplitType = Enums<'split_type'>

/** One person's part of a bill, in the shape bill_shares and recurring_bills.shares use. */
export type Share = { user_id: string; share_cents: number; percent: number | null }

export type PercentInput = { user_id: string; percent: number }

/** Thrown for inputs that can't be split (bad amounts, duplicate people, percents that don't total 100). */
export class SplitError extends Error {
  override name = 'SplitError'
}

/** 100% in basis points (hundredths of a percent). */
export const FULL_BASIS_POINTS = 10_000

/** Largest amount one bill can hold: $1,000,000.00. Catches typos like an extra zero or three. */
export const MAX_BILL_CENTS = 100_000_000

function assertCents(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new SplitError(`Amount must be a whole, non-negative number of cents (got ${amountCents})`)
  }
}

function assertPeople(ids: readonly string[]): void {
  if (ids.length === 0) throw new SplitError('A split needs at least one person')
  if (ids.some((id) => !id)) throw new SplitError('Every share needs a person')
  if (new Set(ids).size !== ids.length) throw new SplitError('Each person can only have one share')
}

const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0)

/**
 * Split `amountCents` evenly. Shares differ by at most 1 cent and sum exactly.
 * The leftover cents (fewer than the number of people) go to the first people
 * in `memberIds` order.
 */
export function equalSplit(amountCents: number, memberIds: readonly string[]): Share[] {
  assertCents(amountCents)
  assertPeople(memberIds)
  const n = memberIds.length
  // `%` is exact on safe integers; dividing a float could round up near 2^53.
  const extra = amountCents % n
  const base = (amountCents - extra) / n
  return memberIds.map((user_id, i) => ({ user_id, share_cents: base + (i < extra ? 1 : 0), percent: null }))
}

/**
 * 33.33 -> 3333 basis points. Null unless `percent` is between 0 and 100 with
 * at most two decimals. Tolerates float noise (33.33 * 100 is 3332.9999...).
 */
export function percentToBasisPoints(percent: number): number | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null
  const scaled = percent * 100
  const bp = Math.round(scaled)
  if (Math.abs(scaled - bp) > 1e-6) return null
  return bp + 0 // normalizes -0
}

/**
 * Split by percentages (each 0-100, up to two decimals, totaling exactly 100)
 * with the largest-remainder method, so shares sum exactly to `amountCents`
 * and each share is within 1 cent of its exact value. A 0% share is always 0.
 * Throws SplitError for invalid percents.
 */
export function percentSplit(amountCents: number, percents: readonly PercentInput[]): Share[] {
  assertCents(amountCents)
  assertPeople(percents.map((p) => p.user_id))
  const bps = percents.map((p) => {
    const bp = percentToBasisPoints(p.percent)
    if (bp === null) throw new SplitError(`${p.percent} isn't a percent between 0 and 100 with up to 2 decimals`)
    return bp
  })
  const totalBp = sum(bps)
  if (totalBp !== FULL_BASIS_POINTS) {
    throw new SplitError(`Percents must add up to 100 (they add up to ${formatBasisPoints(totalBp)})`)
  }

  // BigInt keeps amount * basis points exact for any safe-integer amount.
  const amount = BigInt(amountCents)
  const parts = bps.map((bp, index) => {
    const exact = amount * BigInt(bp)
    return {
      index,
      cents: Number(exact / BigInt(FULL_BASIS_POINTS)),
      remainder: Number(exact % BigInt(FULL_BASIS_POINTS)),
    }
  })
  const leftover = amountCents - sum(parts.map((p) => p.cents))
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (let k = 0; k < leftover; k++) byRemainder[k].cents += 1

  return percents.map((p, i) => ({ user_id: p.user_id, share_cents: parts[i].cents, percent: bps[i] / 100 }))
}

export type ExactSplitCheck = {
  /** What the shares add up to. */
  totalCents: number
  /** amount - total: positive means still to assign, negative means over by that much. */
  remainingCents: number
  valid: boolean
  problem: null | 'under' | 'over' | 'bad-share'
}

/** Check hand-entered shares against the bill amount. */
export function validateExactSplit(amountCents: number, shares: readonly { share_cents: number }[]): ExactSplitCheck {
  const bad =
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0 ||
    shares.some((s) => !Number.isSafeInteger(s.share_cents) || s.share_cents < 0)
  if (bad) {
    const totalCents = sum(shares.map((s) => (Number.isFinite(s.share_cents) ? s.share_cents : 0)))
    return { totalCents, remainingCents: amountCents - totalCents, valid: false, problem: 'bad-share' }
  }
  const totalCents = sum(shares.map((s) => s.share_cents))
  const remainingCents = amountCents - totalCents
  return {
    totalCents,
    remainingCents,
    valid: remainingCents === 0,
    problem: remainingCents > 0 ? 'under' : remainingCents < 0 ? 'over' : null,
  }
}

/**
 * The balance as a sentence for the person viewing it. `myNetCents` is
 * positive when they are owed money.
 */
export function balanceSummary(myNetCents: number, roommateName: string | null | undefined): string {
  const name = roommateName?.trim()
  if (myNetCents > 0) return `${name || 'Your roommate'} owes you ${formatCents(myNetCents)}`
  if (myNetCents < 0) return `You owe ${name || 'your roommate'} ${formatCents(-myNetCents)}`
  return 'You’re all settled up'
}

/** The settlement that clears the balance: from the person who owes to the person owed. */
export function settlementFor(
  myId: string,
  roommateId: string,
  myNetCents: number,
): { from_user: string; to_user: string; amount_cents: number } | null {
  if (myNetCents === 0 || myId === roommateId) return null
  return myNetCents < 0
    ? { from_user: myId, to_user: roommateId, amount_cents: -myNetCents }
    : { from_user: roommateId, to_user: myId, amount_cents: myNetCents }
}

/** A person's share of a bill in cents; 0 when they have no share. */
export function shareOf(shares: readonly { user_id: string; share_cents: number }[], userId: string | null | undefined): number {
  if (!userId) return 0
  return shares.find((s) => s.user_id === userId)?.share_cents ?? 0
}

// ---------------------------------------------------------------------------
// Form helpers: turn what people type into amounts and shares.
// ---------------------------------------------------------------------------

export type AmountCheck = { ok: true; cents: number } | { ok: false; error: string }

/** Parse a bill amount field: more than $0, at most MAX_BILL_CENTS. */
export function parseBillAmount(input: string): AmountCheck {
  if (!input.trim()) return { ok: false, error: 'Enter an amount.' }
  const cents = parseDollars(input)
  if (cents === null) return { ok: false, error: 'Enter an amount like 42.10.' }
  if (cents <= 0) return { ok: false, error: 'Enter an amount above $0.' }
  if (cents > MAX_BILL_CENTS) return { ok: false, error: `Enter an amount up to ${formatCents(MAX_BILL_CENTS)}.` }
  return { ok: true, cents }
}

/** "33.33" or "50%" -> basis points (3333, 5000). Null for anything else. */
export function parsePercentInput(input: string): number | null {
  const cleaned = input.trim().replace(/\s*%$/, '')
  if (!/^(\d{1,3}(\.\d{0,2})?|\.\d{1,2})$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  const bp = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'))
  return bp <= FULL_BASIS_POINTS ? bp : null
}

/** 3333 -> "33.33", 5000 -> "50", 1250 -> "12.5". Keeps the sign. */
export function formatBasisPoints(bp: number): string {
  const sign = bp < 0 ? '-' : ''
  const abs = Math.abs(bp)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0').replace(/0+$/, '')
  return `${sign}${whole}${frac ? `.${frac}` : ''}`
}

export type SplitDraft = {
  split: SplitType
  /** Household order. */
  memberIds: readonly string[]
  /** Dollar text per person, for exact splits. Blank counts as $0. */
  exact: Readonly<Record<string, string>>
  /** Percent text per person, for percent splits. Blank counts as 0%. */
  percent: Readonly<Record<string, string>>
}

export type SplitResult =
  | { ok: true; shares: Share[] }
  | { ok: false; reason: 'amount' | 'members' }
  | { ok: false; reason: 'input'; badMemberIds: string[] }
  | { ok: false; reason: 'under' | 'over'; remainingCents: number }
  | { ok: false; reason: 'percent-under' | 'percent-over'; remainingBasisPoints: number }

/** Work out the shares a bill form describes, or why they don't add up yet. */
export function computeSplit(amountCents: number | null, draft: SplitDraft): SplitResult {
  const { memberIds } = draft
  if (memberIds.length === 0 || new Set(memberIds).size !== memberIds.length) return { ok: false, reason: 'members' }
  if (amountCents === null || !Number.isSafeInteger(amountCents) || amountCents <= 0) return { ok: false, reason: 'amount' }

  if (draft.split === 'equal') return { ok: true, shares: equalSplit(amountCents, memberIds) }

  if (draft.split === 'exact') {
    const parsed = memberIds.map((id) => {
      const text = draft.exact[id]?.trim() ?? ''
      return { user_id: id, cents: text === '' ? 0 : parseDollars(text) }
    })
    const badMemberIds = parsed.filter((p) => p.cents === null).map((p) => p.user_id)
    if (badMemberIds.length > 0) return { ok: false, reason: 'input', badMemberIds }
    const shares: Share[] = parsed.map((p) => ({ user_id: p.user_id, share_cents: p.cents ?? 0, percent: null }))
    const check = validateExactSplit(amountCents, shares)
    if (check.problem === 'under') return { ok: false, reason: 'under', remainingCents: check.remainingCents }
    if (check.problem === 'over') return { ok: false, reason: 'over', remainingCents: check.remainingCents }
    if (!check.valid) return { ok: false, reason: 'input', badMemberIds: [] }
    return { ok: true, shares }
  }

  const parsed = memberIds.map((id) => {
    const text = draft.percent[id]?.trim() ?? ''
    return { user_id: id, bp: text === '' ? 0 : parsePercentInput(text) }
  })
  const badMemberIds = parsed.filter((p) => p.bp === null).map((p) => p.user_id)
  if (badMemberIds.length > 0) return { ok: false, reason: 'input', badMemberIds }
  const remainingBasisPoints = FULL_BASIS_POINTS - sum(parsed.map((p) => p.bp ?? 0))
  if (remainingBasisPoints > 0) return { ok: false, reason: 'percent-under', remainingBasisPoints }
  if (remainingBasisPoints < 0) return { ok: false, reason: 'percent-over', remainingBasisPoints }
  return {
    ok: true,
    shares: percentSplit(
      amountCents,
      parsed.map((p) => ({ user_id: p.user_id, percent: (p.bp ?? 0) / 100 })),
    ),
  }
}

/** Exact-amount fields prefilled with an even split, so they already add up. */
export function defaultExactInputs(amountCents: number | null, memberIds: readonly string[]): Record<string, string> {
  if (amountCents === null || amountCents <= 0 || memberIds.length === 0) {
    return Object.fromEntries(memberIds.map((id) => [id, '']))
  }
  return Object.fromEntries(equalSplit(amountCents, memberIds).map((s) => [s.user_id, centsToInput(s.share_cents)]))
}

/** Percent fields prefilled with an even split that totals exactly 100 (e.g. 33.34 / 33.33 / 33.33). */
export function defaultPercentInputs(memberIds: readonly string[]): Record<string, string> {
  if (memberIds.length === 0) return {}
  return Object.fromEntries(
    equalSplit(FULL_BASIS_POINTS, memberIds).map((s) => [s.user_id, formatBasisPoints(s.share_cents)]),
  )
}

/** Form fields for editing saved shares. People without a saved share start at 0. */
export function inputsFromShares(
  split: SplitType,
  memberIds: readonly string[],
  shares: readonly Share[],
): { exact: Record<string, string>; percent: Record<string, string> } {
  const byUser = new Map(shares.map((s) => [s.user_id, s]))
  const exact = Object.fromEntries(memberIds.map((id) => [id, centsToInput(byUser.get(id)?.share_cents ?? 0)]))
  const percent =
    split === 'percent'
      ? Object.fromEntries(
          memberIds.map((id) => {
            const saved = byUser.get(id)?.percent
            const bp = saved == null ? 0 : (percentToBasisPoints(Number(saved)) ?? 0)
            return [id, formatBasisPoints(bp)]
          }),
        )
      : defaultPercentInputs(memberIds)
  return { exact, percent }
}

/**
 * Read recurring_bills.shares (jsonb) defensively. Returns null when the value
 * isn't a well-formed share list, so callers can refuse to use it.
 */
export function parseShares(value: Json | undefined): Share[] | null {
  if (!Array.isArray(value)) return null
  const shares: Share[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null
    const userId = item.user_id
    const cents = typeof item.share_cents === 'string' ? Number(item.share_cents) : item.share_cents
    const percent = item.percent
    if (typeof userId !== 'string' || !userId) return null
    if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) return null
    if (percent !== null && percent !== undefined && typeof percent !== 'number') return null
    shares.push({ user_id: userId, share_cents: cents, percent: typeof percent === 'number' ? percent : null })
  }
  return shares
}
