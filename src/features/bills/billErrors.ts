import { friendlyError } from '../../lib/errors'

/** friendlyError, plus the bill-specific database errors. */
export function describeBillError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  if (/bill_not_found/i.test(message)) return 'This bill no longer exists. Your roommate may have deleted it.'
  if (/bills_paid_shape/i.test(message)) return 'Pick who paid and the date they paid.'
  if (/bill_shares_pkey|duplicate key.*bill_shares/i.test(message)) return 'Each person can only have one share.'
  if (/settlements_check|from_user <> to_user/i.test(message)) return 'A payment needs two different people.'
  return friendlyError(error)
}
