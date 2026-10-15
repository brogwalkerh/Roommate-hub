import { useEffect, useId, useState, type FormEvent } from 'react'
import { PersonPicker } from '../../components/Person'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { SelectField, TextArea, TextField } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import {
  emptyForm,
  formFromReminder,
  TITLE_MAX,
  toInsert,
  toUpdate,
  validateForm,
  type ReminderFormErrors,
  type ReminderFormValues,
} from './form'
import { useCreateReminder, useDeleteReminder, useUpdateReminder } from './hooks'
import { REPEAT_OPTIONS, repeatLabel, type Reminder, type RepeatRule } from './logic'

type ReminderDialogProps = {
  open: boolean
  /** The reminder to edit, or null to add a new one. */
  reminder: Reminder | null
  onClose: () => void
  /** Called after a save with the saved reminder's assignee (null = both). */
  onSaved: (assigneeId: string | null) => void
}

/**
 * Add / edit form. Its state starts fresh each time it mounts, so the page
 * gives it a new `key` whenever it opens.
 */
export function ReminderDialog({ open, reminder, onClose, onSaved }: ReminderDialogProps) {
  const isEdit = reminder !== null
  const formId = useId()
  const titleId = useId()
  const { toast } = useToast()
  const create = useCreateReminder()
  const update = useUpdateReminder()
  const remove = useDeleteReminder()

  const [initial] = useState<ReminderFormValues>(() => (reminder ? formFromReminder(reminder) : emptyForm(new Date())))
  const [values, setValues] = useState<ReminderFormValues>(initial)
  const [errors, setErrors] = useState<ReminderFormErrors>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // A new reminder starts with the title field ready to type in. The dialog
  // opens in an effect of its own, so wait a tick before focusing.
  useEffect(() => {
    if (isEdit) return
    const id = window.setTimeout(() => document.getElementById(titleId)?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [isEdit, titleId])

  const saving = create.isPending || update.isPending

  function set<K extends keyof ReminderFormValues>(key: K, value: ReminderFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    if (key === 'title' || key === 'due') setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const found = validateForm(values)
    setErrors(found)
    if (found.title || found.due) return
    const done = (saved: Reminder) => {
      onSaved(saved.assignee_id)
      onClose()
    }
    if (reminder) update.mutate({ id: reminder.id, patch: toUpdate(values, initial) }, { onSuccess: done })
    else create.mutate(toInsert(values), { onSuccess: done })
  }

  function confirmDelete() {
    if (!reminder) return
    remove.mutate(reminder.id, {
      onSuccess: () => {
        toast('Reminder deleted')
        onClose()
      },
    })
  }

  if (confirmingDelete && reminder) {
    const repeats = repeatLabel(reminder.repeat)
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Delete reminder?"
        footer={
          <>
            <Button onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}>
              Keep it
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={confirmDelete}>
              Delete reminder
            </Button>
          </>
        }
      >
        <p className="break-words">
          Delete “<strong className="font-semibold">{reminder.title}</strong>”?
        </p>
        <p className="mt-2 text-muted">
          {repeats ? `It repeats ${repeats.toLowerCase()}, so deleting it also cancels the future ones. ` : ''}
          You can’t undo this.
        </p>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit reminder' : 'Add reminder'}
      footer={
        <>
          {isEdit && (
            <Button variant="danger" className="mr-auto" onClick={() => setConfirmingDelete(true)} disabled={saving}>
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} loading={saving}>
            {isEdit ? 'Save changes' : 'Add reminder'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          id={titleId}
          label="Title"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
          maxLength={TITLE_MAX}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Take out the trash"
        />
        <TextArea
          label="Notes (optional)"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            type="datetime-local"
            label="Due"
            value={values.due}
            onChange={(e) => set('due', e.target.value)}
            error={errors.due}
          />
          <SelectField
            label="Repeat"
            value={values.repeat}
            onChange={(e) => set('repeat', e.target.value as RepeatRule)}
            hint={values.repeat === 'none' ? undefined : 'Repeats count from the due time.'}
          >
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
        </div>
        <PersonPicker
          label="Who’s it for?"
          value={values.assigneeId}
          onChange={(id) => set('assigneeId', id)}
          bothLabel="Both of you"
        />
      </form>
    </Dialog>
  )
}
