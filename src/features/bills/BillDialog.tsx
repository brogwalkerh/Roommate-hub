import { FileText, Paperclip, Trash2, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Checkbox, SelectField, TextArea, TextField } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { describeBillError } from './billErrors'
import { CATEGORIES } from './categories'
import { billFormToInput, checkBillForm, initialBillForm, switchSplit, type BillForm } from './forms'
import { useDeleteBill, useOpenReceipt, useSaveBill, useToday, type Bill } from './hooks'
import { ConfirmDeleteFooter, PayerPicker } from './parts'
import { RECEIPT_ACCEPT, formatBytes, receiptNameFromPath, validateReceipt } from './receipts'
import { SplitEditor } from './SplitEditor'

/** Add a bill, or edit / delete an existing one. Mount it only while open. */
export function BillDialog({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const { me, members } = useMembers()
  const memberIds = members.map((m) => m.id)
  const today = useToday()
  const { toast } = useToast()
  const save = useSaveBill()
  const remove = useDeleteBill()
  const openReceipt = useOpenReceipt()
  const formId = useId()

  const [form, setForm] = useState<BillForm>(() => initialBillForm(bill, memberIds, me?.id, today))
  const [amountTouched, setAmountTouched] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const check = checkBillForm(form, memberIds)
  const set = <K extends keyof BillForm>(key: K, value: BillForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const busy = save.isPending || remove.isPending

  const submit = () => {
    const input = billFormToInput(form, bill?.id ?? null, memberIds)
    if (!input) {
      setAmountTouched(true)
      return
    }
    save.mutate(input, {
      onSuccess: () => {
        toast(bill ? 'Saved the bill' : `Added ${input.title}`)
        onClose()
      },
      onError: (err) => toast(describeBillError(err), { tone: 'error' }),
    })
  }

  const confirmDelete = () => {
    if (!bill) return
    remove.mutate(bill.id, {
      onSuccess: () => {
        toast(`Deleted ${bill.title}`)
        onClose()
      },
      onError: (err) => toast(describeBillError(err), { tone: 'error' }),
    })
  }

  const footer = confirmingDelete ? (
    <ConfirmDeleteFooter
      message={bill?.paid_on ? 'Delete this bill? It also comes off the balance.' : 'Delete this bill for both of you?'}
      confirmLabel="Delete bill"
      onCancel={() => setConfirmingDelete(false)}
      onConfirm={confirmDelete}
      loading={remove.isPending}
    />
  ) : (
    <>
      {bill && (
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
        {bill ? 'Save' : 'Add bill'}
      </Button>
    </>
  )

  return (
    <Dialog open onClose={busy ? () => {} : onClose} title={bill ? 'Edit bill' : 'Add bill'} footer={footer} size="lg">
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
          placeholder="Power bill"
          value={form.title}
          maxLength={120}
          required
          autoComplete="off"
          onChange={(e) => set('title', e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Amount"
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

        <div className="flex flex-col gap-1.5">
          <TextField
            label="Due date"
            type="date"
            value={form.dueOn}
            hint={form.dueOn ? undefined : 'Optional'}
            onChange={(e) => set('dueOn', e.target.value)}
          />
          {form.dueOn && (
            <div>
              <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => set('dueOn', '')}>
                No due date
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-xl bg-surface-2 p-4">
          <Checkbox
            label="Already paid"
            checked={form.alreadyPaid}
            onChange={(e) => set('alreadyPaid', e.target.checked)}
          />
          {form.alreadyPaid && (
            <div className="grid gap-4 sm:grid-cols-2">
              <PayerPicker label="Paid by" value={form.paidBy} onChange={(id) => set('paidBy', id)} members={members} />
              <TextField
                label="Paid on"
                type="date"
                required
                value={form.paidOn}
                error={form.paidOn ? null : 'Pick the date it was paid.'}
                onChange={(e) => set('paidOn', e.target.value)}
              />
            </div>
          )}
        </div>

        <SplitEditor
          amountCents={check.amount.ok ? check.amount.cents : null}
          split={form.split}
          onSplitChange={(next) => setForm((f) => switchSplit(f, next, memberIds))}
          members={members}
          exact={form.exact}
          percent={form.percent}
          onExactChange={(id, value) => setForm((f) => ({ ...f, exact: { ...f.exact, [id]: value } }))}
          onPercentChange={(id, value) => setForm((f) => ({ ...f, percent: { ...f.percent, [id]: value } }))}
          result={check.split}
        />

        <TextArea
          label="Notes"
          hint="Optional"
          value={form.notes}
          rows={2}
          onChange={(e) => set('notes', e.target.value)}
        />

        <ReceiptField
          path={form.receiptPath}
          file={form.receiptFile}
          error={receiptError}
          onPick={(file) => {
            const problem = validateReceipt(file)
            setReceiptError(problem)
            if (!problem) set('receiptFile', file)
          }}
          onRemoveFile={() => set('receiptFile', null)}
          onRemovePath={() => set('receiptPath', null)}
          onOpen={(path) => void openReceipt(path)}
        />
      </form>
    </Dialog>
  )
}

function ReceiptField({
  path,
  file,
  error,
  onPick,
  onRemoveFile,
  onRemovePath,
  onOpen,
}: {
  path: string | null
  file: File | null
  error: string | null
  onPick: (file: File) => void
  onRemoveFile: () => void
  onRemovePath: () => void
  onOpen: (path: string) => void
}) {
  const inputId = useId()
  const current = file ? { name: file.name, detail: `${formatBytes(file.size)}, uploads when you save` } : path ? { name: receiptNameFromPath(path), detail: 'Saved' } : null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Receipt</span>
      {current ? (
        <div className="flex items-center gap-3 rounded-xl border border-line p-3">
          <FileText aria-hidden className="size-5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{current.name}</p>
            <p className="text-sm text-muted">{current.detail}</p>
          </div>
          {!file && path && (
            <Button size="sm" onClick={() => onOpen(path)}>
              View
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={file ? onRemoveFile : onRemovePath}>
            Remove
          </Button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink transition-colors hover:bg-surface-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus"
        >
          <Paperclip aria-hidden className="size-4" />
          Attach a photo or PDF
          <input
            id={inputId}
            type="file"
            accept={RECEIPT_ACCEPT}
            className="sr-only"
            aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
            onChange={(e) => {
              const picked = e.target.files?.[0]
              e.target.value = ''
              if (picked) onPick(picked)
            }}
          />
        </label>
      )}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <p id={`${inputId}-hint`} className="text-sm text-muted">
          {current ? 'It also shows in Files, under Receipts.' : 'Optional. Up to 50 MB. It also shows in Files, under Receipts.'}
        </p>
      )}
    </div>
  )
}
