import { centsToInput, formatCents, parseDollars } from './money'

describe('parseDollars', () => {
  it.each([
    ['42', 4200],
    ['42.1', 4210],
    ['42.10', 4210],
    ['$1,042.10', 104210],
    [' 7.5 ', 750],
    ['.99', 99],
    ['0', 0],
    ['12.', 1200],
  ])('parses %j as %i cents', (input, cents) => {
    expect(parseDollars(input)).toBe(cents)
  })

  it.each(['', 'abc', '1.234', '-5', '1e3', '$', '1.2.3'])('rejects %j', (input) => {
    expect(parseDollars(input)).toBeNull()
  })
})

describe('formatCents', () => {
  it('formats US dollars', () => {
    expect(formatCents(4210)).toBe('$42.10')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(-1999)).toBe('-$19.99')
  })
})

describe('centsToInput', () => {
  it('always shows two decimals', () => {
    expect(centsToInput(4200)).toBe('42.00')
    expect(centsToInput(5)).toBe('0.05')
  })
})
