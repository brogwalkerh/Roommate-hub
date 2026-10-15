import {
  billFormToInput,
  checkBillForm,
  checkRecurringForm,
  checkSettleAmount,
  initialBillForm,
  initialRecurringForm,
  recurringFormToInput,
  switchSplit,
  type BillForm,
} from './forms'
import type { Bill, RecurringBill } from './hooks'

const ME = 'me'
const SAM = 'sam'
const members = [ME, SAM]
const today = '2026-10-15'

const savedBill = (patch: Partial<Bill> = {}): Bill => ({
  id: 'bill-1',
  title: 'Power',
  category: 'utilities',
  amount_cents: 10001,
  split: 'percent',
  due_on: '2026-10-20',
  paid_on: null,
  paid_by: null,
  notes: null,
  receipt_path: 'receipts/x/power.pdf',
  recurring_bill_id: null,
  notified_due_on: null,
  created_by: ME,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  bill_shares: [
    { bill_id: 'bill-1', user_id: ME, share_cents: 6001, percent: 60 },
    { bill_id: 'bill-1', user_id: SAM, share_cents: 4000, percent: 40 },
  ],
  ...patch,
})

const filled = (patch: Partial<BillForm> = {}): BillForm => ({
  ...initialBillForm(null, members, ME, today),
  title: 'Groceries',
  amount: '100.01',
  ...patch,
})

describe('initialBillForm', () => {
  it('starts a new bill as an unpaid equal split, paid by me if marked paid', () => {
    const form = initialBillForm(null, members, ME, today)
    expect(form).toMatchObject({
      title: '',
      amount: '',
      category: 'other',
      dueOn: '',
      alreadyPaid: false,
      paidBy: ME,
      paidOn: today,
      split: 'equal',
      percent: { me: '50', sam: '50' },
      receiptPath: null,
    })
    expect(checkBillForm(form, members).canSave).toBe(false)
  })

  it('round-trips a saved bill: editing without changes sends the same shares', () => {
    const bill = savedBill()
    const form = initialBillForm(bill, members, ME, today)
    expect(form).toMatchObject({ amount: '100.01', split: 'percent', percent: { me: '60', sam: '40' }, dueOn: '2026-10-20' })
    const input = billFormToInput(form, bill.id, members)
    expect(input).toMatchObject({
      id: 'bill-1',
      amountCents: 10001,
      split: 'percent',
      paidOn: null,
      paidBy: null,
      receiptPath: 'receipts/x/power.pdf',
      receiptFile: null,
      shares: [
        { user_id: ME, share_cents: 6001, percent: 60 },
        { user_id: SAM, share_cents: 4000, percent: 40 },
      ],
    })
  })

  it('reads a paid bill', () => {
    const form = initialBillForm(savedBill({ paid_on: '2026-10-03', paid_by: SAM }), members, ME, today)
    expect(form).toMatchObject({ alreadyPaid: true, paidBy: SAM, paidOn: '2026-10-03' })
  })
})

describe('checkBillForm', () => {
  it('needs a title, a valid amount and a split that adds up', () => {
    expect(checkBillForm(filled(), members).canSave).toBe(true)
    expect(checkBillForm(filled({ title: '   ' }), members).canSave).toBe(false)
    expect(checkBillForm(filled({ title: 'x'.repeat(121) }), members).canSave).toBe(false)
    expect(checkBillForm(filled({ amount: '0' }), members).canSave).toBe(false)
    expect(checkBillForm(filled({ amount: '12.345' }), members).canSave).toBe(false)
    expect(checkBillForm(filled({ split: 'exact', exact: { me: '50', sam: '50' } }), members).canSave).toBe(false)
    expect(checkBillForm(filled({ split: 'exact', exact: { me: '50.01', sam: '50' } }), members).canSave).toBe(true)
  })

  it('needs who paid and when for an already-paid bill', () => {
    expect(checkBillForm(filled({ alreadyPaid: true, paidBy: SAM, paidOn: today }), members).canSave).toBe(true)
    expect(checkBillForm(filled({ alreadyPaid: true, paidBy: null }), members).canSave).toBe(false)
    expect(checkBillForm(filled({ alreadyPaid: true, paidBy: 'stranger' }), members).canSave).toBe(false)
    expect(checkBillForm(filled({ alreadyPaid: true, paidOn: '' }), members).canSave).toBe(false)
  })
})

describe('billFormToInput', () => {
  it('returns null until the form can be saved', () => {
    expect(billFormToInput(filled({ amount: '' }), null, members)).toBeNull()
  })

  it('sends paid_on and paid_by together, or neither', () => {
    const unpaid = billFormToInput(filled({ paidBy: SAM, paidOn: today }), null, members)
    expect(unpaid).toMatchObject({ paidOn: null, paidBy: null })
    const paid = billFormToInput(filled({ alreadyPaid: true, paidBy: SAM, paidOn: '2026-10-14' }), null, members)
    expect(paid).toMatchObject({ paidOn: '2026-10-14', paidBy: SAM })
  })

  it('trims text, clears blanks and splits evenly', () => {
    const input = billFormToInput(filled({ title: '  Groceries  ', notes: '  ', dueOn: '' }), null, members)
    expect(input).toMatchObject({
      id: null,
      title: 'Groceries',
      notes: null,
      dueOn: null,
      amountCents: 10001,
      shares: [
        { user_id: ME, share_cents: 5001, percent: null },
        { user_id: SAM, share_cents: 5000, percent: null },
      ],
    })
  })

  it('replaces the old receipt when a new file is chosen', () => {
    const file = new File(['x'], 'new.pdf', { type: 'application/pdf' })
    const input = billFormToInput(filled({ receiptPath: 'receipts/old/a.pdf', receiptFile: file }), null, members)
    expect(input).toMatchObject({ receiptPath: null, receiptFile: file })
  })
})

describe('switchSplit', () => {
  it('prefills exact amounts with an even split when they are blank', () => {
    const form = switchSplit(filled(), 'exact', members)
    expect(form.split).toBe('exact')
    expect(form.exact).toEqual({ me: '50.01', sam: '50.00' })
    expect(checkBillForm(form, members).canSave).toBe(true)
  })

  it('keeps amounts that were already typed', () => {
    const form = switchSplit(filled({ split: 'percent', exact: { me: '70', sam: '' } }), 'exact', members)
    expect(form.exact).toEqual({ me: '70', sam: '' })
  })

  it('prefills percents when they are blank', () => {
    const form = switchSplit(filled({ percent: { me: '', sam: '' } }), 'percent', members)
    expect(form.percent).toEqual({ me: '50', sam: '50' })
  })

  it('does nothing when the split is unchanged', () => {
    const form = filled()
    expect(switchSplit(form, 'equal', members)).toBe(form)
  })
})

describe('recurring form', () => {
  const template = (patch: Partial<RecurringBill> = {}): RecurringBill => ({
    id: 'rb-1',
    title: 'Rent',
    category: 'rent',
    amount_cents: 180000,
    split: 'exact',
    shares: [
      { user_id: ME, share_cents: 100000, percent: null },
      { user_id: SAM, share_cents: 80000, percent: null },
    ],
    day_of_month: 1,
    default_payer: ME,
    lead_days: 7,
    active: true,
    created_by: ME,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...patch,
  })

  it('starts new templates on the 1st, 7 days ahead, active', () => {
    const form = initialRecurringForm(null, members)
    expect(form).toMatchObject({ dayOfMonth: 1, leadDays: 7, active: true, split: 'equal', defaultPayer: null })
    expect(checkRecurringForm(form, members).canSave).toBe(false)
  })

  it('round-trips a saved template', () => {
    const form = initialRecurringForm(template(), members)
    expect(form).toMatchObject({ amount: '1800.00', exact: { me: '1000.00', sam: '800.00' }, defaultPayer: ME })
    expect(recurringFormToInput(form, 'rb-1', members)).toEqual({
      id: 'rb-1',
      title: 'Rent',
      category: 'rent',
      amountCents: 180000,
      split: 'exact',
      shares: [
        { user_id: ME, share_cents: 100000, percent: null },
        { user_id: SAM, share_cents: 80000, percent: null },
      ],
      dayOfMonth: 1,
      defaultPayer: ME,
      leadDays: 7,
      active: true,
    })
  })

  it('falls back to an even split when the stored shares are unreadable', () => {
    const form = initialRecurringForm(template({ shares: null }), members)
    expect(form.split).toBe('equal')
    expect(recurringFormToInput(form, 'rb-1', members)?.shares).toEqual([
      { user_id: ME, share_cents: 90000, percent: null },
      { user_id: SAM, share_cents: 90000, percent: null },
    ])
  })

  it('drops a default payer who is no longer in the household', () => {
    expect(initialRecurringForm(template({ default_payer: 'gone' }), members).defaultPayer).toBeNull()
  })

  it('checks the day of month and lead days', () => {
    const form = initialRecurringForm(template(), members)
    expect(checkRecurringForm({ ...form, dayOfMonth: 31 }, members).canSave).toBe(true)
    expect(checkRecurringForm({ ...form, dayOfMonth: 0 }, members).canSave).toBe(false)
    expect(checkRecurringForm({ ...form, dayOfMonth: 32 }, members).canSave).toBe(false)
    expect(checkRecurringForm({ ...form, leadDays: 28 }, members).canSave).toBe(true)
    expect(checkRecurringForm({ ...form, leadDays: 29 }, members).canSave).toBe(false)
    expect(checkRecurringForm({ ...form, amount: '1800.01' }, members).canSave).toBe(false)
  })
})

describe('checkSettleAmount', () => {
  it('allows up to the full balance', () => {
    expect(checkSettleAmount('42.10', 4210)).toEqual({ ok: true, cents: 4210 })
    expect(checkSettleAmount('20', 4210)).toEqual({ ok: true, cents: 2000 })
  })

  it('rejects more than the balance, zero and junk', () => {
    expect(checkSettleAmount('42.11', 4210)).toEqual({ ok: false, error: 'That’s more than the $42.10 balance.' })
    expect(checkSettleAmount('0', 4210)).toMatchObject({ ok: false })
    expect(checkSettleAmount('abc', 4210)).toMatchObject({ ok: false })
  })
})
