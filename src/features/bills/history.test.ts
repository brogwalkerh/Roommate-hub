import { groupHistory } from './history'

const bill = (id: string, paid_on: string | null, amount_cents: number, created_at = `${paid_on ?? '2026-01-01'}T12:00:00Z`) => ({
  id,
  paid_on,
  amount_cents,
  created_at,
})
const settlement = (id: string, paid_on: string, amount_cents: number, created_at = `${paid_on}T12:00:00Z`) => ({
  id,
  paid_on,
  amount_cents,
  created_at,
})

describe('groupHistory', () => {
  it('returns nothing for no history', () => {
    expect(groupHistory([], [])).toEqual([])
  })

  it('interleaves bills and settlements newest first, grouped by month with totals', () => {
    const months = groupHistory(
      [
        bill('rent-oct', '2026-10-01', 180000),
        bill('power', '2026-10-12', 6403),
        bill('rent-sep', '2026-09-01', 180000),
        bill('unpaid', null, 999),
      ],
      [settlement('s1', '2026-10-05', 4210), settlement('s2', '2026-09-30', 1000)],
      (b) => Math.floor(b.amount_cents / 2),
    )

    expect(months.map((m) => m.key)).toEqual(['2026-10', '2026-09'])
    expect(months[0].label).toBe('October 2026')
    expect(months[0].entries.map((e) => `${e.kind}:${e.item.id}`)).toEqual([
      'bill:power',
      'settlement:s1',
      'bill:rent-oct',
    ])
    expect(months[0].billsTotalCents).toBe(186403)
    expect(months[0].myShareCents).toBe(90000 + 3201)
    expect(months[0].settledCents).toBe(4210)

    expect(months[1].entries.map((e) => e.item.id)).toEqual(['s2', 'rent-sep'])
    expect(months[1].billsTotalCents).toBe(180000)
    expect(months[1].settledCents).toBe(1000)
  })

  it('orders same-day entries by when they were added, newest first', () => {
    const months = groupHistory(
      [bill('first', '2026-10-01', 100, '2026-10-01T08:00:00Z'), bill('second', '2026-10-01', 100, '2026-10-01T09:00:00Z')],
      [settlement('middle', '2026-10-01', 50, '2026-10-01T08:30:00Z')],
    )
    expect(months[0].entries.map((e) => e.item.id)).toEqual(['second', 'middle', 'first'])
  })

  it('keeps months across years apart', () => {
    const months = groupHistory([bill('a', '2026-01-03', 100), bill('b', '2025-12-30', 200)], [])
    expect(months.map((m) => m.label)).toEqual(['January 2026', 'December 2025'])
  })

  it('handles a month with only settlements', () => {
    const months = groupHistory([], [settlement('s', '2026-08-15', 500)])
    expect(months).toEqual([
      {
        key: '2026-08',
        label: 'August 2026',
        entries: [{ kind: 'settlement', date: '2026-08-15', item: settlement('s', '2026-08-15', 500) }],
        billsTotalCents: 0,
        myShareCents: 0,
        settledCents: 500,
      },
    ])
  })
})
