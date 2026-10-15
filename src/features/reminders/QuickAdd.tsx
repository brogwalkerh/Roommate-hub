import { useState, type FormEvent } from 'react'
import { TextField } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { formatDayTime } from '../../lib/dates'
import { TITLE_MAX, quickAddInsert } from './form'
import { useCreateReminder } from './hooks'
import type { Reminder } from './logic'

/** One text field: type a title, press Enter. Due at the next full hour, for both of you. */
export function QuickAdd({ onAdded }: { onAdded: (reminder: Reminder) => void }) {
  const [text, setText] = useState('')
  const create = useCreateReminder()
  const { toast } = useToast()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (create.isPending) return
    const insert = quickAddInsert(text, new Date())
    if (!insert) return
    create.mutate(insert, {
      onSuccess: (reminder) => {
        setText('')
        toast(`Added for ${formatDayTime(new Date(reminder.due_at))}`)
        onAdded(reminder)
      },
    })
  }

  return (
    <form onSubmit={submit}>
      <TextField
        label="Add a reminder"
        hideLabel
        placeholder="Add a reminder, then press Enter"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={TITLE_MAX}
        autoComplete="off"
        enterKeyHint="done"
      />
    </form>
  )
}
