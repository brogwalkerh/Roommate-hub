import {
  FULL_BASIS_POINTS,
  MAX_BILL_CENTS,
  SplitError,
  balanceSummary,
  computeSplit,
  defaultExactInputs,
  defaultPercentInputs,
  equalSplit,
  formatBasisPoints,
  inputsFromShares,
  parseBillAmount,
  parsePercentInput,
  parseShares,
  percentSplit,
  percentToBasisPoints,
  settlementFor,
  shareOf,
  validateExactSplit,
  type Share,
} from './split'

const total = (shares: Share[]) => shares.reduce((t, s) => t + s.share_cents, 0)
const cents = (shares: Share[]) => shares.map((s) => s.share_cents)

describe('equalSplit', () => {
  it('splits an even amount evenly', () => {
    expect(equalSplit(10000, ['a', 'b'])).toEqual([
      { user_id: 'a', share_cents: 5000, percent: null },
      { user_id: 'b', share_cents: 5000, percent: null },
    ])
  })

  it('gives the odd cent to the first person ($100.01 two ways)', () => {
    expect(cents(equalSplit(10001, ['a', 'b']))).toEqual([5001, 5000])
    expect(cents(equalSplit(10001, ['b', 'a']))).toEqual([5001, 5000])
    expect(equalSplit(10001, ['b', 'a'])[0].user_id).toBe('b')
  })

  it('gives leftover cents to the first people in order ($100.01 and $100.02 three ways)', () => {
    expect(cents(equalSplit(10001, ['a', 'b', 'c']))).toEqual([3334, 3334, 3333])
    expect(cents(equalSplit(10002, ['a', 'b', 'c']))).toEqual([3334, 3334, 3334])
    expect(cents(equalSplit(10000, ['a', 'b', 'c']))).toEqual([3334, 3333, 3333])
  })

  it('handles 1 cent and 0 cents', () => {
    expect(cents(equalSplit(1, ['a', 'b']))).toEqual([1, 0])
    expect(cents(equalSplit(1, ['a', 'b', 'c']))).toEqual([1, 0, 0])
    expect(cents(equalSplit(0, ['a', 'b']))).toEqual([0, 0])
  })

  it('handles one person', () => {
    expect(cents(equalSplit(4210, ['a']))).toEqual([4210])
  })

  it('stays exact for very large amounts', () => {
    const big = Number.MAX_SAFE_INTEGER
    for (const n of [2, 3, 7]) {
      const ids = Array.from({ length: n }, (_, i) => `u${i}`)
      const shares = equalSplit(big, ids)
      expect(total(shares)).toBe(big)
      const values = cents(shares)
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
      expect(values.every(Number.isSafeInteger)).toBe(true)
    }
  })

  it('always sums exactly and differs by at most a cent', () => {
    for (let amount = 0; amount <= 2000; amount++) {
      for (const n of [1, 2, 3, 4]) {
        const shares = equalSplit(amount, ['a', 'b', 'c', 'd'].slice(0, n))
        expect(total(shares)).toBe(amount)
        const values = cents(shares)
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
        // Larger shares come first, so the rule is "first people get the extra cents".
        expect([...values].sort((x, y) => y - x)).toEqual(values)
      }
    }
  })

  it.each([
    [-1, ['a']],
    [1.5, ['a']],
    [Number.NaN, ['a']],
    [Number.MAX_SAFE_INTEGER + 1, ['a']],
    [100, []],
    [100, ['a', 'a']],
    [100, ['a', '']],
  ])('rejects amount %s with people %j', (amount, ids) => {
    expect(() => equalSplit(amount, ids)).toThrow(SplitError)
  })
})

describe('percentToBasisPoints', () => {
  it.each([
    [0, 0],
    [50, 5000],
    [33.33, 3333],
    [33.34, 3334],
    [12.5, 1250],
    [0.01, 1],
    [100, 10000],
    [-0, 0],
  ])('%s%% -> %i', (percent, bp) => {
    expect(percentToBasisPoints(percent)).toBe(bp)
  })

  it.each([-0.01, 100.01, 33.333, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (percent) => {
    expect(percentToBasisPoints(percent)).toBeNull()
  })
})

describe('percentSplit', () => {
  it('splits 50/50 like an equal split', () => {
    expect(
      percentSplit(10001, [
        { user_id: 'a', percent: 50 },
        { user_id: 'b', percent: 50 },
      ]),
    ).toEqual([
      { user_id: 'a', share_cents: 5001, percent: 50 },
      { user_id: 'b', share_cents: 5000, percent: 50 },
    ])
  })

  it('splits 60/40', () => {
    expect(
      cents(
        percentSplit(180000, [
          { user_id: 'a', percent: 60 },
          { user_id: 'b', percent: 40 },
        ]),
      ),
    ).toEqual([108000, 72000])
  })

  it('handles 33.33 / 33.33 / 33.34 with largest remainders', () => {
    const shares = percentSplit(10000, [
      { user_id: 'a', percent: 33.33 },
      { user_id: 'b', percent: 33.33 },
      { user_id: 'c', percent: 33.34 },
    ])
    expect(cents(shares)).toEqual([3333, 3333, 3334])
    expect(shares.map((s) => s.percent)).toEqual([33.33, 33.33, 33.34])

    // $100.01: exact shares 3333.3333, 3333.3333, 3334.3334. One cent is left
    // over and the remainders tie (.3333 each for a and b, .3334 for c): c wins.
    expect(
      cents(
        percentSplit(10001, [
          { user_id: 'a', percent: 33.33 },
          { user_id: 'b', percent: 33.33 },
          { user_id: 'c', percent: 33.34 },
        ]),
      ),
    ).toEqual([3333, 3333, 3335])
  })

  it('breaks remainder ties by input order', () => {
    // 1 cent at 50/50: both remainders are .5, the first person gets it.
    expect(
      cents(
        percentSplit(1, [
          { user_id: 'a', percent: 50 },
          { user_id: 'b', percent: 50 },
        ]),
      ),
    ).toEqual([1, 0])
    expect(
      cents(
        percentSplit(1, [
          { user_id: 'b', percent: 50 },
          { user_id: 'a', percent: 50 },
        ]),
      ),
    ).toEqual([1, 0])
  })

  it('gives the leftover cent to the largest remainder, not the first person', () => {
    // $0.10 at 25/75: exact 2.5 and 7.5. Tie -> first. At 24/76: 2.4 and 7.6 -> second.
    expect(
      cents(
        percentSplit(10, [
          { user_id: 'a', percent: 24 },
          { user_id: 'b', percent: 76 },
        ]),
      ),
    ).toEqual([2, 8])
  })

  it('never gives a 0% share any money', () => {
    for (const amount of [1, 2, 3, 99, 10001, 123457]) {
      const shares = percentSplit(amount, [
        { user_id: 'a', percent: 0 },
        { user_id: 'b', percent: 33.33 },
        { user_id: 'c', percent: 66.67 },
      ])
      expect(shares[0].share_cents).toBe(0)
      expect(total(shares)).toBe(amount)
    }
    expect(
      cents(
        percentSplit(4210, [
          { user_id: 'a', percent: 100 },
          { user_id: 'b', percent: 0 },
        ]),
      ),
    ).toEqual([4210, 0])
  })

  it('stays exact for large amounts', () => {
    const big = Number.MAX_SAFE_INTEGER
    const shares = percentSplit(big, [
      { user_id: 'a', percent: 33.33 },
      { user_id: 'b', percent: 33.33 },
      { user_id: 'c', percent: 33.34 },
    ])
    expect(total(shares)).toBe(big)
    expect(cents(shares).every(Number.isSafeInteger)).toBe(true)
  })

  it('is stable: same input, same output, each share within a cent of exact', () => {
    const sets = [
      [50, 50],
      [33.33, 33.33, 33.34],
      [12.5, 87.5],
      [0.01, 99.99],
      [10, 20, 30, 40],
      [0, 0, 100],
    ]
    for (let amount = 1; amount <= 1500; amount += 7) {
      for (const set of sets) {
        const input = set.map((percent, i) => ({ user_id: `u${i}`, percent }))
        const first = percentSplit(amount, input)
        expect(percentSplit(amount, input)).toEqual(first)
        expect(total(first)).toBe(amount)
        first.forEach((share, i) => {
          const exact = (amount * Math.round(set[i] * 100)) / FULL_BASIS_POINTS
          expect(Math.abs(share.share_cents - exact)).toBeLessThan(1)
        })
      }
    }
  })

  it('gives each person the same cents whatever order they are listed in, when remainders differ', () => {
    const forward = percentSplit(10001, [
      { user_id: 'a', percent: 24 },
      { user_id: 'b', percent: 76 },
    ])
    const backward = percentSplit(10001, [
      { user_id: 'b', percent: 76 },
      { user_id: 'a', percent: 24 },
    ])
    expect(shareOf(forward, 'a')).toBe(shareOf(backward, 'a'))
    expect(shareOf(forward, 'b')).toBe(shareOf(backward, 'b'))
  })

  it.each([
    [[50, 49.99]],
    [[50, 50.01]],
    [[100, 100]],
    [[]],
    [[33.333, 66.667]],
    [[-10, 110]],
  ])('rejects percents %j', (set) => {
    expect(() =>
      percentSplit(
        100,
        set.map((percent, i) => ({ user_id: `u${i}`, percent })),
      ),
    ).toThrow(SplitError)
  })

  it('rejects duplicate people and bad amounts', () => {
    expect(() =>
      percentSplit(100, [
        { user_id: 'a', percent: 50 },
        { user_id: 'a', percent: 50 },
      ]),
    ).toThrow(SplitError)
    expect(() => percentSplit(-5, [{ user_id: 'a', percent: 100 }])).toThrow(SplitError)
    expect(() => percentSplit(0.5, [{ user_id: 'a', percent: 100 }])).toThrow(SplitError)
  })
})

describe('validateExactSplit', () => {
  it('accepts shares that add up', () => {
    expect(validateExactSplit(10001, [{ share_cents: 5001 }, { share_cents: 5000 }])).toEqual({
      totalCents: 10001,
      remainingCents: 0,
      valid: true,
      problem: null,
    })
  })

  it('accepts a 0 share', () => {
    expect(validateExactSplit(4210, [{ share_cents: 4210 }, { share_cents: 0 }]).valid).toBe(true)
  })

  it('reports what is left to assign', () => {
    expect(validateExactSplit(10000, [{ share_cents: 6000 }, { share_cents: 1000 }])).toEqual({
      totalCents: 7000,
      remainingCents: 3000,
      valid: false,
      problem: 'under',
    })
  })

  it('reports how much it is over', () => {
    expect(validateExactSplit(10000, [{ share_cents: 6000 }, { share_cents: 4001 }])).toEqual({
      totalCents: 10001,
      remainingCents: -1,
      valid: false,
      problem: 'over',
    })
  })

  it('rejects fractional or negative shares', () => {
    expect(validateExactSplit(100, [{ share_cents: 50.5 }, { share_cents: 49.5 }]).problem).toBe('bad-share')
    expect(validateExactSplit(100, [{ share_cents: 150 }, { share_cents: -50 }]).valid).toBe(false)
    expect(validateExactSplit(100, [{ share_cents: Number.NaN }]).valid).toBe(false)
  })

  it('treats no shares as nothing assigned', () => {
    expect(validateExactSplit(100, [])).toMatchObject({ remainingCents: 100, valid: false, problem: 'under' })
  })
})

describe('balanceSummary', () => {
  it('says who owes whom', () => {
    expect(balanceSummary(4210, 'Sam')).toBe('Sam owes you $42.10')
    expect(balanceSummary(-4210, 'Sam')).toBe('You owe Sam $42.10')
    expect(balanceSummary(0, 'Sam')).toBe('You’re all settled up')
  })

  it('handles single cents and big amounts', () => {
    expect(balanceSummary(1, 'Sam')).toBe('Sam owes you $0.01')
    expect(balanceSummary(-123456789, 'Sam')).toBe('You owe Sam $1,234,567.89')
  })

  it('falls back when the roommate has no name yet', () => {
    expect(balanceSummary(500, null)).toBe('Your roommate owes you $5.00')
    expect(balanceSummary(-500, '  ')).toBe('You owe your roommate $5.00')
  })
})

describe('settlementFor', () => {
  it('sends money from the person who owes to the person owed', () => {
    expect(settlementFor('me', 'sam', -4210)).toEqual({ from_user: 'me', to_user: 'sam', amount_cents: 4210 })
    expect(settlementFor('me', 'sam', 4210)).toEqual({ from_user: 'sam', to_user: 'me', amount_cents: 4210 })
  })

  it('returns null when settled', () => {
    expect(settlementFor('me', 'sam', 0)).toBeNull()
    expect(settlementFor('me', 'me', 100)).toBeNull()
  })
})

describe('shareOf', () => {
  const shares = [
    { user_id: 'a', share_cents: 600 },
    { user_id: 'b', share_cents: 400 },
  ]
  it('finds a share and defaults to 0', () => {
    expect(shareOf(shares, 'b')).toBe(400)
    expect(shareOf(shares, 'c')).toBe(0)
    expect(shareOf(shares, null)).toBe(0)
  })
})

describe('parseBillAmount', () => {
  it('parses dollars to cents', () => {
    expect(parseBillAmount('42.10')).toEqual({ ok: true, cents: 4210 })
    expect(parseBillAmount('$1,800')).toEqual({ ok: true, cents: 180000 })
    expect(parseBillAmount('0.01')).toEqual({ ok: true, cents: 1 })
  })

  it('explains bad amounts', () => {
    expect(parseBillAmount('')).toEqual({ ok: false, error: 'Enter an amount.' })
    expect(parseBillAmount('abc')).toEqual({ ok: false, error: 'Enter an amount like 42.10.' })
    expect(parseBillAmount('1.234')).toMatchObject({ ok: false })
    expect(parseBillAmount('0')).toEqual({ ok: false, error: 'Enter an amount above $0.' })
    expect(parseBillAmount('0.00')).toMatchObject({ ok: false })
    expect(parseBillAmount('1000000.01')).toMatchObject({ ok: false })
    expect(parseBillAmount('1000000.00')).toEqual({ ok: true, cents: MAX_BILL_CENTS })
  })
})

describe('parsePercentInput', () => {
  it.each([
    ['50', 5000],
    ['33.33', 3333],
    ['12.5', 1250],
    ['.5', 50],
    ['50%', 5000],
    [' 25 % ', 2500],
    ['0', 0],
    ['100', 10000],
    ['100.00', 10000],
    ['7.', 700],
  ])('parses %j as %i basis points', (input, bp) => {
    expect(parsePercentInput(input)).toBe(bp)
  })

  it.each(['', 'abc', '-1', '100.01', '101', '1.234', '1e2', '1000', '.', '50%%'])('rejects %j', (input) => {
    expect(parsePercentInput(input)).toBeNull()
  })
})

describe('formatBasisPoints', () => {
  it.each([
    [5000, '50'],
    [3333, '33.33'],
    [1250, '12.5'],
    [5, '0.05'],
    [10000, '100'],
    [0, '0'],
    [-150, '-1.5'],
  ])('%i -> %j', (bp, text) => {
    expect(formatBasisPoints(bp)).toBe(text)
  })

  it('round-trips with parsePercentInput', () => {
    for (let bp = 0; bp <= FULL_BASIS_POINTS; bp += 37) {
      expect(parsePercentInput(formatBasisPoints(bp))).toBe(bp)
    }
  })
})

describe('computeSplit', () => {
  const members = ['a', 'b']
  const draft = (patch: Partial<Parameters<typeof computeSplit>[1]>) => ({
    split: 'equal' as const,
    memberIds: members,
    exact: {},
    percent: {},
    ...patch,
  })

  it('needs an amount and people', () => {
    expect(computeSplit(null, draft({}))).toEqual({ ok: false, reason: 'amount' })
    expect(computeSplit(0, draft({}))).toEqual({ ok: false, reason: 'amount' })
    expect(computeSplit(100, draft({ memberIds: [] }))).toEqual({ ok: false, reason: 'members' })
    expect(computeSplit(100, draft({ memberIds: ['a', 'a'] }))).toEqual({ ok: false, reason: 'members' })
  })

  it('splits equally', () => {
    expect(computeSplit(10001, draft({}))).toEqual({ ok: true, shares: equalSplit(10001, members) })
  })

  it('checks exact amounts, counting blanks as $0', () => {
    expect(computeSplit(10000, draft({ split: 'exact', exact: { a: '60', b: '40.00' } }))).toEqual({
      ok: true,
      shares: [
        { user_id: 'a', share_cents: 6000, percent: null },
        { user_id: 'b', share_cents: 4000, percent: null },
      ],
    })
    expect(computeSplit(10000, draft({ split: 'exact', exact: { a: '100' } }))).toMatchObject({ ok: true })
    expect(computeSplit(10000, draft({ split: 'exact', exact: { a: '60' } }))).toEqual({
      ok: false,
      reason: 'under',
      remainingCents: 4000,
    })
    expect(computeSplit(10000, draft({ split: 'exact', exact: { a: '60', b: '40.01' } }))).toEqual({
      ok: false,
      reason: 'over',
      remainingCents: -1,
    })
    expect(computeSplit(10000, draft({ split: 'exact', exact: { a: '6o', b: '40' } }))).toEqual({
      ok: false,
      reason: 'input',
      badMemberIds: ['a'],
    })
  })

  it('checks percents and splits them exactly', () => {
    const result = computeSplit(10001, draft({ split: 'percent', percent: { a: '50', b: '50' } }))
    expect(result).toEqual({
      ok: true,
      shares: [
        { user_id: 'a', share_cents: 5001, percent: 50 },
        { user_id: 'b', share_cents: 5000, percent: 50 },
      ],
    })
    expect(computeSplit(100, draft({ split: 'percent', percent: { a: '60' } }))).toEqual({
      ok: false,
      reason: 'percent-under',
      remainingBasisPoints: 4000,
    })
    expect(computeSplit(100, draft({ split: 'percent', percent: { a: '60', b: '40.5' } }))).toEqual({
      ok: false,
      reason: 'percent-over',
      remainingBasisPoints: -50,
    })
    expect(computeSplit(100, draft({ split: 'percent', percent: { a: '60', b: 'x' } }))).toEqual({
      ok: false,
      reason: 'input',
      badMemberIds: ['b'],
    })
    expect(computeSplit(100, draft({ split: 'percent', percent: { a: '100', b: '' } }))).toMatchObject({
      ok: true,
      shares: [
        { user_id: 'a', share_cents: 100, percent: 100 },
        { user_id: 'b', share_cents: 0, percent: 0 },
      ],
    })
  })

  it('always produces shares that sum to the amount when ok', () => {
    for (let amount = 1; amount < 3000; amount += 13) {
      for (const d of [
        draft({}),
        draft({ split: 'percent', percent: { a: '33.33', b: '66.67' } }),
        draft({ split: 'exact', exact: defaultExactInputs(amount, members) }),
      ]) {
        const result = computeSplit(amount, d)
        expect(result.ok).toBe(true)
        if (result.ok) expect(total(result.shares)).toBe(amount)
      }
    }
  })
})

describe('form defaults', () => {
  it('prefills exact amounts with an even split', () => {
    expect(defaultExactInputs(10001, ['a', 'b'])).toEqual({ a: '50.01', b: '50.00' })
    expect(defaultExactInputs(null, ['a', 'b'])).toEqual({ a: '', b: '' })
  })

  it('prefills percents that total 100', () => {
    expect(defaultPercentInputs(['a', 'b'])).toEqual({ a: '50', b: '50' })
    expect(defaultPercentInputs(['a', 'b', 'c'])).toEqual({ a: '33.34', b: '33.33', c: '33.33' })
    expect(defaultPercentInputs([])).toEqual({})
  })

  it('reads saved shares back into fields', () => {
    const shares: Share[] = [
      { user_id: 'a', share_cents: 6001, percent: 60 },
      { user_id: 'b', share_cents: 4000, percent: 40 },
    ]
    expect(inputsFromShares('percent', ['a', 'b'], shares)).toEqual({
      exact: { a: '60.01', b: '40.00' },
      percent: { a: '60', b: '40' },
    })
    expect(inputsFromShares('exact', ['a', 'b', 'c'], shares.map((s) => ({ ...s, percent: null })))).toEqual({
      exact: { a: '60.01', b: '40.00', c: '0.00' },
      percent: { a: '33.34', b: '33.33', c: '33.33' },
    })
  })
})

describe('parseShares', () => {
  it('reads a well-formed list', () => {
    expect(
      parseShares([
        { user_id: 'a', share_cents: 600, percent: 60 },
        { user_id: 'b', share_cents: '400', percent: null },
        { user_id: 'c', share_cents: 0 },
      ]),
    ).toEqual([
      { user_id: 'a', share_cents: 600, percent: 60 },
      { user_id: 'b', share_cents: 400, percent: null },
      { user_id: 'c', share_cents: 0, percent: null },
    ])
    expect(parseShares([])).toEqual([])
  })

  it.each([
    [null],
    [{}],
    ['[]'],
    [[{ share_cents: 1 }]],
    [[{ user_id: 'a', share_cents: -1 }]],
    [[{ user_id: 'a', share_cents: 1.5 }]],
    [[{ user_id: 'a', share_cents: 1, percent: '50' }]],
    [[null]],
  ])('rejects %j', (value) => {
    expect(parseShares(value)).toBeNull()
  })
})
