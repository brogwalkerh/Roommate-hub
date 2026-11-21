import { debtSentence, describeLeadDays, describeSplit, paidShareLabel, personName, settlementSentence } from './wording'

const people: Record<string, { display_name: string }> = { me: { display_name: 'Alex' }, sam: { display_name: 'Sam' } }
const byId = (id: string | null | undefined) => (id ? (people[id] ?? null) : null)

describe('personName', () => {
  it('says you for the viewer', () => {
    expect(personName('me', 'me', byId)).toBe('You')
    expect(personName('me', 'me', byId, false)).toBe('you')
    expect(personName('sam', 'me', byId)).toBe('Sam')
    expect(personName('gone', 'me', byId)).toBe('Your roommate')
    expect(personName(null, 'me', byId, false)).toBe('your roommate')
  })
})

describe('settlementSentence', () => {
  it('reads from the viewer’s side', () => {
    expect(settlementSentence({ from_user: 'sam', to_user: 'me' }, 'me', byId)).toBe('Sam paid you')
    expect(settlementSentence({ from_user: 'me', to_user: 'sam' }, 'me', byId)).toBe('You paid Sam')
  })
})

describe('describeSplit', () => {
  it('describes each kind of split', () => {
    expect(describeSplit('equal', [], byId)).toBe('Split equally')
    expect(
      describeSplit(
        'percent',
        [
          { user_id: 'me', share_cents: 6000, percent: 60 },
          { user_id: 'sam', share_cents: 4000, percent: 40 },
        ],
        byId,
      ),
    ).toBe('Alex 60%, Sam 40%')
    expect(
      describeSplit(
        'exact',
        [
          { user_id: 'me', share_cents: 100000, percent: null },
          { user_id: 'sam', share_cents: 80000, percent: null },
        ],
        byId,
      ),
    ).toBe('Alex $1,000.00, Sam $800.00')
    expect(describeSplit('exact', null, byId)).toBe('Split equally')
  })
})

describe('describeLeadDays', () => {
  it('reads naturally', () => {
    expect(describeLeadDays(0)).toBe('On the day it’s due')
    expect(describeLeadDays(1)).toBe('1 day before it’s due')
    expect(describeLeadDays(7)).toBe('7 days before it’s due')
  })
})

describe('debtSentence', () => {
  const base = { payer_id: 'me', user_id: 'sam', share_cents: 4210, paid_cents: 0, paid_back_on: null }
  const date = (d: string) => `on ${d}`

  it('says who owes whom, from the viewer’s side', () => {
    expect(debtSentence(base, 'me', byId, date)).toBe('Sam owes you $42.10')
    expect(debtSentence({ ...base, payer_id: 'sam', user_id: 'me' }, 'me', byId, date)).toBe('You owe Sam $42.10')
  })

  it('shows partial and full payments', () => {
    expect(debtSentence({ ...base, paid_cents: 2000 }, 'me', byId, date)).toBe('Sam has paid $20.00 of $42.10')
    expect(debtSentence({ ...base, payer_id: 'sam', user_id: 'me', paid_cents: 2000 }, 'me', byId, date)).toBe(
      'You have paid $20.00 of $42.10',
    )
    expect(debtSentence({ ...base, paid_cents: 4210, paid_back_on: '2026-10-17' }, 'me', byId, date)).toBe(
      'Sam paid you back on 2026-10-17',
    )
    expect(debtSentence({ ...base, payer_id: 'sam', user_id: 'me', paid_cents: 4210 }, 'me', byId, date)).toBe(
      'You paid Sam back',
    )
  })
})

describe('paidShareLabel', () => {
  it('is “I paid” for the viewer and the name otherwise', () => {
    expect(paidShareLabel('me', 'me', byId)).toBe('I paid')
    expect(paidShareLabel('sam', 'me', byId)).toBe('Sam paid')
  })
})
