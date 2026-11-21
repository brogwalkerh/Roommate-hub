import { Check, Undo2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { describeBillError } from './billErrors'
import { usePayShare, useToday, useUnpayShare } from './hooks'
import { formatBillDate } from './schedule'
import { owedCents, shareStatus, type BillDebt } from './shares'
import { debtSentence, paidShareLabel } from './wording'

/**
 * One person's share of a bill and whether they've paid the payer back, with
 * the button that records it. `undoable` also offers to take a payment back
 * (the bill dialog); lists leave that out to stay tidy.
 */
export function ShareLine({ debt, undoable = false }: { debt: BillDebt; undoable?: boolean }) {
  const { me, byId } = useMembers()
  const today = useToday()
  const { toast } = useToast()
  const pay = usePayShare()
  const unpay = useUnpayShare()
  const status = shareStatus(debt)
  const busy = pay.isPending || unpay.isPending

  const undo = () =>
    unpay.mutate(
      { billId: debt.bill_id, fromUser: debt.user_id },
      { onError: (err) => toast(describeBillError(err), { tone: 'error' }) },
    )

  const markPaid = () =>
    pay.mutate(
      { billId: debt.bill_id, fromUser: debt.user_id, toUser: debt.payer_id, amountCents: owedCents(debt), paidOn: today },
      {
        onSuccess: () =>
          toast(`Recorded: ${debtSentence({ ...debt, paid_cents: debt.share_cents, paid_back_on: null }, me?.id, byId, () => '')}`, {
            action: { label: 'Undo', onClick: undo },
          }),
        onError: (err) => toast(describeBillError(err), { tone: 'error' }),
      },
    )

  const sentence = debtSentence(debt, me?.id, byId, (date) => formatBillDate(date, today))

  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <p className={`min-w-0 text-sm tabular ${status === 'paid' ? 'text-muted' : 'font-medium text-ink'}`}>
        {status === 'paid' && <Check aria-hidden className="mr-1 inline size-4 align-text-bottom text-accent" />}
        {sentence}
      </p>
      {status === 'paid' ? (
        undoable && (
          <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} loading={unpay.isPending} disabled={busy} onClick={undo}>
            Not paid yet
          </Button>
        )
      ) : (
        <Button
          size="sm"
          icon={<Check className="size-4" />}
          aria-label={`${paidShareLabel(debt.user_id, me?.id, byId)}: ${debt.title}`}
          loading={pay.isPending}
          disabled={busy}
          onClick={markPaid}
        >
          {paidShareLabel(debt.user_id, me?.id, byId)}
        </Button>
      )}
    </div>
  )
}
