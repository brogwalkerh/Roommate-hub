import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { formatCents } from '../../lib/money'
import { describeBillError } from './billErrors'
import { useDeleteSettlement, useToday, type Settlement } from './hooks'
import { ConfirmDeleteFooter } from './parts'
import { formatBillDate } from './schedule'
import { settlementSentence } from './wording'

/** Details of a settle-up payment, with delete. Mount it only while open. */
export function SettlementDialog({ settlement, onClose }: { settlement: Settlement; onClose: () => void }) {
  const { me, byId } = useMembers()
  const today = useToday()
  const { toast } = useToast()
  const remove = useDeleteSettlement()
  const [confirming, setConfirming] = useState(false)

  const confirmDelete = () =>
    remove.mutate(settlement.id, {
      onSuccess: () => {
        toast('Deleted the payment')
        onClose()
      },
      onError: (err) => toast(describeBillError(err), { tone: 'error' }),
    })

  return (
    <Dialog
      open
      onClose={remove.isPending ? () => {} : onClose}
      title="Payment"
      footer={
        confirming ? (
          <ConfirmDeleteFooter
            message="Delete this payment? The balance goes back to what it was before it."
            confirmLabel="Delete payment"
            onCancel={() => setConfirming(false)}
            onConfirm={confirmDelete}
            loading={remove.isPending}
          />
        ) : (
          <>
            <Button
              variant="danger"
              className="mr-auto"
              icon={<Trash2 className="size-4" />}
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-lg font-semibold">
          {settlementSentence(settlement, me?.id, byId)}{' '}
          <span className="tabular">{formatCents(settlement.amount_cents)}</span>
        </p>
        <p className="text-muted">On {formatBillDate(settlement.paid_on, today)}</p>
        {settlement.note && <p className="whitespace-pre-wrap">{settlement.note}</p>}
      </div>
    </Dialog>
  )
}
