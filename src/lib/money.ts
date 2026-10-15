// Money is always an integer number of cents. Never store or add dollars as
// floating point; convert only at the edges (parsing input, formatting output).

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** 4210 -> "$42.10" */
export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}

/**
 * Parse what a person typed into a money field. Accepts "42", "42.1",
 * "$1,042.10", " 7.5 ". Returns null for anything that is not a non-negative
 * amount with at most two decimals.
 */
export function parseDollars(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, '').replace(/,/g, '').trim()
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned) && !/^\.\d{1,2}$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  return Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'))
}

/** 4210 -> "42.10" for prefilling an input. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2)
}
