// Form state for the bill, recurring bill and settle-up dialogs, kept pure so
// the rules (what can be saved, what gets sent) are tested without a browser.

import { centsToInput, formatCents, parseDollars } from '../../lib/money'
import type { Bill, RecurringBill, RecurringBillInput, SaveBillInput } from './hooks'
import {
  computeSplit,
  defaultExactInputs,
  defaultPercentInputs,
  equalSplit,
  inputsFromShares,
  parseBillAmount,
  type AmountCheck,
  type SplitResult,
  type SplitType,
} from './split'

/** Fields every split editor has. */
export type SplitFields = {
  amount: string
  split: SplitType
  exact: Record<string, string>
  percent: Record<string, string>
}

/**
 * Change the split type. Switching to exact amounts or percents with nothing
 * typed yet prefills an even split, so the numbers already add up.
 */
export function switchSplit<F extends SplitFields>(form: F, next: SplitType, memberIds: readonly string[]): F {
  if (next === form.split) return form
  const blank = (values: Record<string, string>) =>
    memberIds.every((id) => {
      const text = values[id]?.trim() ?? ''
      return text === '' || parseDollars(text) === 0
    })
  const amount = parseBillAmount(form.amount)
  const amountCents = amount.ok ? amount.cents : null
  return {
    ...form,
    split: next,
    exact: next === 'exact' && blank(form.exact) ? defaultExactInputs(amountCents, memberIds) : form.exact,
    percent: next === 'percent' && blank(form.percent) ? defaultPercentInputs(memberIds) : form.percent,
  }
}

// ---------------------------------------------------------------------------
// Bill
// ---------------------------------------------------------------------------

export type BillForm = SplitFields & {
  title: string
  category: string
  /** "" when there's no due date. */
  dueOn: string
  alreadyPaid: boolean
  paidBy: string | null
  paidOn: string
  notes: string
  /** Existing receipt to keep; null for none. */
  receiptPath: string | null
  /** New receipt chosen in this dialog. */
  receiptFile: File | null
}

export function initialBillForm(
  bill: Bill | null,
  memberIds: readonly string[],
  myId: string | null | undefined,
  today: string,
): BillForm {
  if (!bill) {
    return {
      title: '',
      amount: '',
      category: 'other',
      dueOn: '',
      alreadyPaid: false,
      paidBy: myId ?? memberIds[0] ?? null,
      paidOn: today,
      split: 'equal',
      exact: defaultExactInputs(null, memberIds),
      percent: defaultPercentInputs(memberIds),
      notes: '',
      receiptPath: null,
      receiptFile: null,
    }
  }
  const { exact, percent } = inputsFromShares(bill.split, memberIds, bill.bill_shares)
  return {
    title: bill.title,
    amount: centsToInput(bill.amount_cents),
    category: bill.category,
    dueOn: bill.due_on ?? '',
    alreadyPaid: bill.paid_on !== null,
    paidBy: bill.paid_by ?? myId ?? memberIds[0] ?? null,
    paidOn: bill.paid_on ?? today,
    split: bill.split,
    exact,
    percent,
    notes: bill.notes ?? '',
    receiptPath: bill.receipt_path,
    receiptFile: null,
  }
}

export type BillFormCheck = {
  amount: AmountCheck
  split: SplitResult
  titleOk: boolean
  paidOk: boolean
  canSave: boolean
}

export function checkBillForm(form: BillForm, memberIds: readonly string[]): BillFormCheck {
  const amount = parseBillAmount(form.amount)
  const split = computeSplit(amount.ok ? amount.cents : null, { ...form, memberIds })
  const titleOk = form.title.trim().length > 0 && form.title.trim().length <= 120
  const paidOk = !form.alreadyPaid || (!!form.paidBy && memberIds.includes(form.paidBy) && /^\d{4}-\d{2}-\d{2}$/.test(form.paidOn))
  return { amount, split, titleOk, paidOk, canSave: titleOk && amount.ok && split.ok && paidOk }
}

/** What to send to save_bill, or null when the form can't be saved yet. */
export function billFormToInput(form: BillForm, id: string | null, memberIds: readonly string[]): SaveBillInput | null {
  const check = checkBillForm(form, memberIds)
  if (!check.canSave || !check.amount.ok || !check.split.ok) return null
  const paid = form.alreadyPaid
  return {
    id,
    title: form.title.trim(),
    category: form.category,
    amountCents: check.amount.cents,
    split: form.split,
    dueOn: form.dueOn || null,
    paidOn: paid ? form.paidOn : null,
    paidBy: paid ? form.paidBy : null,
    notes: form.notes.trim() || null,
    shares: check.split.shares,
    receiptPath: form.receiptFile ? null : form.receiptPath,
    receiptFile: form.receiptFile,
  }
}

// ---------------------------------------------------------------------------
// Recurring bill
// ---------------------------------------------------------------------------

export type RecurringForm = SplitFields & {
  title: string
  category: string
  dayOfMonth: number
  defaultPayer: string | null
  leadDays: number
  active: boolean
}

export function initialRecurringForm(template: RecurringBill | null, memberIds: readonly string[]): RecurringForm {
  if (!template) {
    return {
      title: '',
      amount: '',
      category: 'other',
      dayOfMonth: 1,
      split: 'equal',
      exact: defaultExactInputs(null, memberIds),
      percent: defaultPercentInputs(memberIds),
      defaultPayer: null,
      leadDays: 7,
      active: true,
    }
  }
  // A template whose stored shares are unreadable starts over as an even split.
  const split = template.shares ? template.split : 'equal'
  const shares = template.shares ?? (memberIds.length > 0 ? equalSplit(template.amount_cents, memberIds) : [])
  const { exact, percent } = inputsFromShares(split, memberIds, shares)
  return {
    title: template.title,
    amount: centsToInput(template.amount_cents),
    category: template.category,
    dayOfMonth: template.day_of_month,
    split,
    exact,
    percent,
    defaultPayer: template.default_payer && memberIds.includes(template.default_payer) ? template.default_payer : null,
    leadDays: template.lead_days,
    active: template.active,
  }
}

export type RecurringFormCheck = {
  amount: AmountCheck
  split: SplitResult
  titleOk: boolean
  scheduleOk: boolean
  canSave: boolean
}

export function checkRecurringForm(form: RecurringForm, memberIds: readonly string[]): RecurringFormCheck {
  const amount = parseBillAmount(form.amount)
  const split = computeSplit(amount.ok ? amount.cents : null, { ...form, memberIds })
  const titleOk = form.title.trim().length > 0 && form.title.trim().length <= 120
  const scheduleOk =
    Number.isInteger(form.dayOfMonth) &&
    form.dayOfMonth >= 1 &&
    form.dayOfMonth <= 31 &&
    Number.isInteger(form.leadDays) &&
    form.leadDays >= 0 &&
    form.leadDays <= 28
  return { amount, split, titleOk, scheduleOk, canSave: titleOk && scheduleOk && amount.ok && split.ok }
}

export function recurringFormToInput(
  form: RecurringForm,
  id: string | null,
  memberIds: readonly string[],
): RecurringBillInput | null {
  const check = checkRecurringForm(form, memberIds)
  if (!check.canSave || !check.amount.ok || !check.split.ok) return null
  return {
    id,
    title: form.title.trim(),
    category: form.category,
    amountCents: check.amount.cents,
    split: form.split,
    shares: check.split.shares,
    dayOfMonth: form.dayOfMonth,
    defaultPayer: form.defaultPayer,
    leadDays: form.leadDays,
    active: form.active,
  }
}

// ---------------------------------------------------------------------------
// Settle up
// ---------------------------------------------------------------------------

/** A settle-up amount: more than $0 and no more than what's owed. */
export function checkSettleAmount(input: string, owedCents: number): AmountCheck {
  const amount = parseBillAmount(input)
  if (!amount.ok) return amount
  if (amount.cents > owedCents) return { ok: false, error: `That’s more than the ${formatCents(owedCents)} balance.` }
  return amount
}
