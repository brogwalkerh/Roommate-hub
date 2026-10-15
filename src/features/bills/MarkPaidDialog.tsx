import { Check } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { TextField } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { formatCents } from '../../lib/money'
import { describeBillError } from './billErrors'
import { useMarkPaid, useRecurringBills, useToday, type Bill } from './hooks'
import { PayerPicker } from './parts'

/** Ask who paid and when, then mark the bill paid. Mount it only while open. */
export function MarkPaidDialog({
  bill,
  onClose,
  onPaid,
}: {
  bill: Bill
  onClose: () => void
  /** Called after it's saved, e.g. to offer an undo. */
  onPaid: (bill: Bill) => void
}) {
  const { me, members } = useMembers()
  const { data: templates } = useRecurringBills()
  const today = useToday()
  const { toast } = useToast()
  const markPaid = useMarkPaid()
  const formId = useId()

  const templatePayer = templates?.find((t) => t.id === bill.recurring_bill_id)?.default_payer ?? null
  const suggested = [templatePayer, me?.id].find((id) => id && members.some((m) => m.id === id)) ?? null
  const [paidBy, setPaidBy] = useState<string | null>(suggested)
  const [paidOn, setPaidOn] = useState(today)
  const canSave = !!paidBy && !!paidOn

  const submit = () => {
    if (!paidBy || !paidOn) return
    markPaid.mutate(
      { id: bill.id, paidBy, paidOn },
      {
        onSuccess: () => {
          onPaid(bill)
          onClose()
        },
        onError: (err) => toast(describeBillError(err), { tone: 'error' }),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={markPaid.isPending ? () => {} : onClose}
      title="Mark paid"
      footer={
        <>
          <Button onClick={onClose} disabled={markPaid.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            icon={<Check className="size-4" />}
            disabled={!canSave}
            loading={markPaid.isPending}
          >
            Mark paid
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <p className="text-muted">
          <span className="font-medium text-ink">{bill.title}</span>,{' '}
          <span className="tabular">{formatCents(bill.amount_cents)}</span>
        </p>
        <PayerPicker label="Who paid?" value={paidBy} onChange={setPaidBy} members={members} />
        <TextField
          data-autofocus
          label="Paid on"
          type="date"
          required
          value={paidOn}
          error={paidOn ? null : 'Pick the date it was paid.'}
          onChange={(e) => setPaidOn(e.target.value)}
        />
      </form>
    </Dialog>
  )
}
