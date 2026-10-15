import { CalendarClock, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Checkbox, SelectField, TextField } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { friendlyError } from '../../lib/errors'
import { describeBillError } from './billErrors'
import { CATEGORIES } from './categories'
import { checkRecurringForm, initialRecurringForm, recurringFormToInput, switchSplit, type RecurringForm } from './forms'
import { useDeleteRecurringBill, useSaveRecurringBill, useToday, type RecurringBill } from './hooks'
import { ConfirmDeleteFooter, PayerPicker } from './parts'
import { formatBillDate, nextRecurringBill, ordinal } from './schedule'
import { SplitEditor } from './SplitEditor'
import { describeLeadDays } from './wording'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const LEAD_DAYS = Array.from({ length: 29 }, (_, i) => i)

/** Add or edit a recurring monthly bill. Mount it only while open. */
export function RecurringDialog({ template, onClose }: { template: RecurringBill | null; onClose: () => void }) {
  const { members } = useMembers()
  const memberIds = members.map((m) => m.id)
  const today = useToday()
  const { toast } = useToast()
  const save = useSaveRecurringBill()
  const remove = useDeleteRecurringBill()
  const formId = useId()

  const [form, setForm] = useState<RecurringForm>(() => initialRecurringForm(template, memberIds))
  const [amountTouched, setAmountTouched] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const check = checkRecurringForm(form, memberIds)
  const set = <K extends keyof RecurringForm>(key: K, value: RecurringForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const busy = save.isPending || remove.isPending
  const next = nextRecurringBill(form.dayOfMonth, form.leadDays, today)

  const submit = () => {
    const input = recurringFormToInput(form, template?.id ?? null, memberIds)
    if (!input) {
      setAmountTouched(true)
      return
    }
    save.mutate(input, {
      onSuccess: ({ generated, generateError }) => {
        if (generateError) {
          toast(`Saved, but the next bill couldn’t be added yet: ${friendlyError(generateError)}`, { tone: 'error' })
        } else if (generated && generated > 0) {
          toast(`Saved. The next ${input.title} bill is in Upcoming.`)
        } else {
          toast(template ? 'Saved the recurring bill' : `Added ${input.title}`)
        }
        onClose()
      },
      onError: (err) => toast(describeBillError(err), { tone: 'error' }),
    })
  }

  const confirmDelete = () => {
    if (!template) return
    remove.mutate(template.id, {
      onSuccess: () => {
        toast(`Deleted ${template.title}`)
        onClose()
      },
      onError: (err) => toast(describeBillError(err), { tone: 'error' }),
    })
  }

  const footer = confirmingDelete ? (
    <ConfirmDeleteFooter
      message="Stop this recurring bill? Bills it already added stay."
      confirmLabel="Delete"
      onCancel={() => setConfirmingDelete(false)}
      onConfirm={confirmDelete}
      loading={remove.isPending}
    />
  ) : (
    <>
      {template && (
        <Button
          variant="danger"
          className="mr-auto"
          icon={<Trash2 className="size-4" />}
          onClick={() => setConfirmingDelete(true)}
          disabled={busy}
        >
          Delete
        </Button>
      )}
      <Button onClick={onClose} disabled={save.isPending}>
        Cancel
      </Button>
      <Button type="submit" form={formId} variant="primary" disabled={!check.canSave || remove.isPending} loading={save.isPending}>
        {template ? 'Save' : 'Add recurring bill'}
      </Button>
    </>
  )

  return (
    <Dialog
      open
      onClose={busy ? () => {} : onClose}
      title={template ? 'Edit recurring bill' : 'Add recurring bill'}
      footer={footer}
      size="lg"
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
        <TextField
          data-autofocus
          label="What’s it for?"
          placeholder="Rent"
          value={form.title}
          maxLength={120}
          required
          autoComplete="off"
          onChange={(e) => set('title', e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Amount each month"
            placeholder="$0.00"
            inputMode="decimal"
            autoComplete="off"
            required
            value={form.amount}
            error={amountTouched && !check.amount.ok ? check.amount.error : null}
            onChange={(e) => set('amount', e.target.value)}
            onBlur={() => setAmountTouched(form.amount.trim() !== '')}
            className="tabular"
          />
          <SelectField label="Category" value={form.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Due every month on the"
            value={String(form.dayOfMonth)}
            onChange={(e) => set('dayOfMonth', Number(e.target.value))}
            hint="The 29th, 30th and 31st land on the last day in shorter months."
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Create the bill"
            value={String(form.leadDays)}
            onChange={(e) => set('leadDays', Number(e.target.value))}
          >
            {LEAD_DAYS.map((d) => (
              <option key={d} value={d}>
                {describeLeadDays(d)}
              </option>
            ))}
          </SelectField>
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {form.active ? (
              <>
                Next one is due {formatBillDate(next.dueOn, today)}.{' '}
                {next.addedNow
                  ? 'It shows up in Upcoming as soon as you save.'
                  : `It shows up in Upcoming on ${formatBillDate(next.addedOn, today)}.`}
              </>
            ) : (
              'Paused. No new bills get added until you turn it back on.'
            )}
            {template && ' Changes apply to bills added from now on.'}
          </span>
        </p>

        <SplitEditor
          amountCents={check.amount.ok ? check.amount.cents : null}
          split={form.split}
          onSplitChange={(nextSplit) => setForm((f) => switchSplit(f, nextSplit, memberIds))}
          members={members}
          exact={form.exact}
          percent={form.percent}
          onExactChange={(id, value) => setForm((f) => ({ ...f, exact: { ...f.exact, [id]: value } }))}
          onPercentChange={(id, value) => setForm((f) => ({ ...f, percent: { ...f.percent, [id]: value } }))}
          result={check.split}
        />

        <div className="flex flex-col gap-1.5">
          <PayerPicker
            label="Usually paid by"
            value={form.defaultPayer}
            onChange={(id) => set('defaultPayer', id)}
            members={members}
            noneLabel="Ask each time"
          />
          <p className="text-sm text-muted">Fills in “Who paid?” when you mark the bill paid.</p>
        </div>

        <Checkbox
          label="Add these bills automatically"
          checked={form.active}
          onChange={(e) => set('active', e.target.checked)}
        />
      </form>
    </Dialog>
  )
}
