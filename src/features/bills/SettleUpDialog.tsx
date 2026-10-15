import { ArrowRight } from 'lucide-react'
import { useId, useState } from 'react'
import { PersonChip } from '../../components/Person'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { TextField } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import type { Profile } from '../../household/useHousehold'
import { centsToInput, formatCents } from '../../lib/money'
import { describeBillError } from './billErrors'
import { checkSettleAmount } from './forms'
import { useSettleUp, useToday } from './hooks'
import { settlementFor } from './split'

/**
 * Record a payment between roommates, prefilled with the full balance.
 * Mount it only while open, and only when someone owes money.
 */
export function SettleUpDialog({
  me,
  roommate,
  myNetCents,
  onClose,
}: {
  me: Profile
  roommate: Profile
  myNetCents: number
  onClose: () => void
}) {
  const today = useToday()
  const { toast } = useToast()
  const settle = useSettleUp()
  const formId = useId()

  // Fixed when the dialog opens, so a live balance update can't flip the direction mid-edit.
  const [plan] = useState(() => settlementFor(me.id, roommate.id, myNetCents))
  const owed = plan?.amount_cents ?? 0
  const [amount, setAmount] = useState(() => centsToInput(owed))
  const [paidOn, setPaidOn] = useState(today)
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)

  const check = checkSettleAmount(amount, owed)
  const from = plan?.from_user === me.id ? me : roommate
  const to = from.id === me.id ? roommate : me
  const canSave = !!plan && check.ok && !!paidOn

  const submit = () => {
    if (!plan || !check.ok || !paidOn) {
      setTouched(true)
      return
    }
    settle.mutate(
      { fromUser: from.id, toUser: to.id, amountCents: check.cents, paidOn, note: note.trim() || null },
      {
        onSuccess: () => {
          toast(check.cents === owed ? 'You’re all settled up' : `Recorded a ${formatCents(check.cents)} payment`)
          onClose()
        },
        onError: (err) => toast(describeBillError(err), { tone: 'error' }),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={settle.isPending ? () => {} : onClose}
      title="Settle up"
      footer={
        <>
          <Button onClick={onClose} disabled={settle.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={!canSave} loading={settle.isPending}>
            Record payment
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <PersonChip person={from} />
            <ArrowRight aria-hidden className="size-4 text-muted" />
            <PersonChip person={to} />
          </p>
          <p className="text-muted">
            {from.id === me.id
              ? `Record what you paid ${roommate.display_name}, by cash, Venmo or however you sent it.`
              : `Record what ${roommate.display_name} paid you, by cash, Venmo or however they sent it.`}{' '}
            This doesn’t move any money.
          </p>
        </div>

        <TextField
          data-autofocus
          label="Amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => setTouched(true)}
          error={touched && !check.ok ? check.error : null}
          hint={`The full balance is ${formatCents(owed)}.`}
          className="tabular"
        />
        <TextField
          label="Paid on"
          type="date"
          required
          value={paidOn}
          error={paidOn ? null : 'Pick the date it was paid.'}
          onChange={(e) => setPaidOn(e.target.value)}
        />
        <TextField
          label="Note"
          hint="Optional"
          placeholder="Venmo for October"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </form>
    </Dialog>
  )
}
