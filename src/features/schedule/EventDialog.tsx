import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PersonPicker } from '../../components/Person'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Checkbox, TextArea, TextField } from '../../components/ui/Field'
import {
  moveStart,
  setAllDay,
  toSaveFields,
  validateEventForm,
  valuesFromRow,
  type EventFormValues,
} from './eventForm'
import { useDeleteEvent, useSaveEvent } from './hooks'
import type { EventItem } from './types'

/** What the dialog is for. Pass a new object each time the dialog opens so the form resets. */
export type EditorTarget = { mode: 'create'; values: EventFormValues } | { mode: 'edit'; item: EventItem }

const FORM_ID = 'event-form'

function initialValues(target: EditorTarget): EventFormValues {
  return target.mode === 'create' ? target.values : valuesFromRow(target.item.raw)
}

/** Create, edit and delete a native event. */
export function EventDialog({ open, target, onClose }: { open: boolean; target: EditorTarget; onClose: () => void }) {
  const [seenTarget, setSeenTarget] = useState(target)
  const [values, setValues] = useState(() => initialValues(target))
  const [submitted, setSubmitted] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const save = useSaveEvent()
  const remove = useDeleteEvent()

  // Reset the form each time the dialog is opened for a different target.
  if (target !== seenTarget) {
    setSeenTarget(target)
    setValues(initialValues(target))
    setSubmitted(false)
    setConfirmingDelete(false)
  }

  const editing = target.mode === 'edit'
  const errors = validateEventForm(values)
  const busy = save.isPending || remove.isPending

  const update = (patch: Partial<EventFormValues>) => setValues((current) => ({ ...current, ...patch }))

  const submit = () => {
    setSubmitted(true)
    const result = toSaveFields(values)
    if (!result.ok) return
    const done = { onSuccess: onClose }
    if (target.mode === 'edit') save.mutate({ id: target.item.id, fields: result.fields }, done)
    else save.mutate({ fields: result.fields }, done)
  }

  const confirmDelete = () => {
    if (target.mode === 'edit') remove.mutate(target.item.id, { onSuccess: onClose })
  }

  if (confirmingDelete) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Delete event?"
        footer={
          <>
            <Button onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Keep event
            </Button>
            <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} loading={remove.isPending} onClick={confirmDelete}>
              Delete event
            </Button>
          </>
        }
      >
        <p className="font-medium">“{values.title.trim() || 'Untitled event'}” will be removed for both of you.</p>
        <p className="mt-1 text-muted">This can’t be undone.</p>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit event' : 'Add event'}
      footer={
        <>
          {editing && (
            <Button
              variant="danger"
              className="mr-auto"
              icon={<Trash2 className="size-4" aria-hidden />}
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={save.isPending} disabled={remove.isPending}>
            {editing ? 'Save' : 'Add event'}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <TextField
          label="Title"
          value={values.title}
          maxLength={200}
          autoComplete="off"
          data-autofocus
          error={submitted ? errors.title : null}
          onChange={(e) => update({ title: e.target.value })}
        />

        <Checkbox label="All day" checked={values.allDay} onChange={(e) => setValues(setAllDay(values, e.target.checked))} />

        <div className="grid gap-4 sm:grid-cols-2">
          {values.allDay ? (
            <>
              <TextField
                key="start-day"
                label="Starts"
                type="date"
                value={values.startDay}
                onChange={(e) => setValues(moveStart(values, e.target.value))}
              />
              <TextField
                key="end-day"
                label="Ends"
                type="date"
                value={values.endDay}
                error={errors.range}
                onChange={(e) => update({ endDay: e.target.value })}
              />
            </>
          ) : (
            <>
              <TextField
                key="start-at"
                label="Starts"
                type="datetime-local"
                value={values.startAt}
                onChange={(e) => setValues(moveStart(values, e.target.value))}
              />
              <TextField
                key="end-at"
                label="Ends"
                type="datetime-local"
                value={values.endAt}
                error={errors.range}
                onChange={(e) => update({ endAt: e.target.value })}
              />
            </>
          )}
        </div>

        <PersonPicker label="Whose event" bothLabel="Household" value={values.ownerId} onChange={(ownerId) => update({ ownerId })} />

        <TextField label="Location" value={values.location} autoComplete="off" onChange={(e) => update({ location: e.target.value })} />

        <TextArea label="Notes" value={values.notes} onChange={(e) => update({ notes: e.target.value })} />
      </form>
    </Dialog>
  )
}
