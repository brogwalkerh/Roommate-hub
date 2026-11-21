import { debtsForBill, openDebts, owedCents, planSettlement, shareStatus, type BillDebt } from './shares'

const debt = (patch: Partial<BillDebt> & Pick<BillDebt, 'bill_id' | 'share_cents'>): BillDebt => ({
  title: patch.bill_id,
  due_on: null,
  paid_on: null,
  created_at: '2026-11-01T00:00:00Z',
  payer_id: 'brogden',
  user_id: 'collin',
  paid_cents: 0,
  paid_back_on: null,
  ...patch,
})

describe('shareStatus and owedCents', () => {
  it('is unpaid, partly paid or paid by what has come back', () => {
    expect(shareStatus({ share_cents: 19065, paid_cents: 0 })).toBe('unpaid')
    expect(shareStatus({ share_cents: 19065, paid_cents: 10000 })).toBe('partly')
    expect(shareStatus({ share_cents: 19065, paid_cents: 19065 })).toBe('paid')
    expect(shareStatus({ share_cents: 19065, paid_cents: 20000 })).toBe('paid')
  })

  it('never owes less than nothing', () => {
    expect(owedCents({ share_cents: 19065, paid_cents: 10000 })).toBe(9065)
    expect(owedCents({ share_cents: 19065, paid_cents: 20000 })).toBe(0)
  })
})

describe('debtsForBill and openDebts', () => {
  const water = debt({ bill_id: 'water', share_cents: 19065, created_at: '2026-11-03T00:00:00Z' })
  const electric = debt({ bill_id: 'electric', share_cents: 22949, created_at: '2026-11-02T00:00:00Z' })
  const internet = debt({ bill_id: 'internet', share_cents: 3250, created_at: '2026-11-01T00:00:00Z', paid_cents: 3250 })
  const theirs = debt({ bill_id: 'home-depot', share_cents: 7200, user_id: 'brogden', payer_id: 'collin' })

  it('picks one bill’s debts', () => {
    expect(debtsForBill([water, electric, theirs], 'water')).toEqual([water])
  })

  it('lists what one person still owes the other, oldest bill first', () => {
    expect(openDebts([water, internet, electric, theirs], 'collin', 'brogden').map((d) => d.bill_id)).toEqual([
      'electric',
      'water',
    ])
    expect(openDebts([water, theirs], 'brogden', 'collin').map((d) => d.bill_id)).toEqual(['home-depot'])
  })
})

describe('planSettlement', () => {
  const electric = debt({ bill_id: 'electric', share_cents: 22949, created_at: '2026-11-02T00:00:00Z' })
  const water = debt({ bill_id: 'water', share_cents: 19065, created_at: '2026-11-03T00:00:00Z', paid_cents: 9065 })
  const open = [electric, water]

  it('pays off whole bills oldest first and keeps the rest as a plain payment', () => {
    expect(planSettlement(22949 + 10000, open)).toEqual({
      covered: [
        { bill_id: 'electric', title: 'electric', amount_cents: 22949 },
        { bill_id: 'water', title: 'water', amount_cents: 10000 },
      ],
      remainderCents: 0,
    })
    expect(planSettlement(25000, open)).toEqual({
      covered: [{ bill_id: 'electric', title: 'electric', amount_cents: 22949 }],
      remainderCents: 2051,
    })
  })

  it('covers a later smaller bill when the older one does not fit', () => {
    expect(planSettlement(10000, open)).toEqual({
      covered: [{ bill_id: 'water', title: 'water', amount_cents: 10000 }],
      remainderCents: 0,
    })
  })

  it('leaves a payment that covers nothing whole as one plain payment', () => {
    expect(planSettlement(500, open)).toEqual({ covered: [], remainderCents: 500 })
    expect(planSettlement(0, open)).toEqual({ covered: [], remainderCents: 0 })
  })

  it('records more than is owed as left over', () => {
    expect(planSettlement(40000, open)).toEqual({
      covered: [
        { bill_id: 'electric', title: 'electric', amount_cents: 22949 },
        { bill_id: 'water', title: 'water', amount_cents: 10000 },
      ],
      remainderCents: 7051,
    })
  })
})
