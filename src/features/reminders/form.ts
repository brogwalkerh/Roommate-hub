// Pure helpers for the add/edit form: initial values, validation and the
// payloads sent to the database.

import type { TablesInsert, TablesUpdate } from '../../lib/database.types'
import { toDateTimeInput } from '../../lib/dates'
import { defaultDueAt, type Reminder, type RepeatRule } from './logic'

export const TITLE_MAX = 200

export type ReminderFormValues = {
  title: string
  notes: string
  /** Local "yyyy-MM-ddTHH:mm", the format of <input type="datetime-local">. */
  due: string
  repeat: RepeatRule
  /** Profile id, or null for both of you. */
  assigneeId: string | null
}

export type ReminderFormErrors = { title?: string; due?: string }

export function emptyForm(now: Date): ReminderFormValues {
  return { title: '', notes: '', due: toDateTimeInput(defaultDueAt(now)), repeat: 'none', assigneeId: null }
}

export function formFromReminder(reminder: Reminder): ReminderFormValues {
  return {
    title: reminder.title,
    notes: reminder.notes ?? '',
    due: toDateTimeInput(new Date(reminder.due_at)),
    repeat: reminder.repeat,
    assigneeId: reminder.assignee_id,
  }
}

/** Local datetime-local value -> ISO string for the database, or null when it isn't a real date. */
export function parseDueInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function validateForm(values: ReminderFormValues): ReminderFormErrors {
  const errors: ReminderFormErrors = {}
  const title = values.title.trim()
  if (!title) errors.title = 'Give the reminder a title.'
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`
  if (parseDueInput(values.due) === null) errors.due = 'Pick a due date and time.'
  return errors
}

/** Values must pass validateForm first. */
export function toInsert(values: ReminderFormValues): TablesInsert<'reminders'> {
  return {
    title: values.title.trim(),
    notes: values.notes.trim() || null,
    due_at: parseDueInput(values.due) as string,
    repeat: values.repeat,
    assignee_id: values.assigneeId,
  }
}

/**
 * Values must pass validateForm first. due_at is sent only when the person
 * changed it: the database restarts the repeat schedule whenever due_at
 * changes, and a round trip through the minute-precision input must not do
 * that by accident.
 */
export function toUpdate(values: ReminderFormValues, initial: ReminderFormValues): TablesUpdate<'reminders'> {
  const patch: TablesUpdate<'reminders'> = {
    title: values.title.trim(),
    notes: values.notes.trim() || null,
    repeat: values.repeat,
    assignee_id: values.assigneeId,
  }
  if (values.due !== initial.due) patch.due_at = parseDueInput(values.due) as string
  return patch
}

/** A reminder from the quick-add field: due at the default time, for both of you. Null for blank text. */
export function quickAddInsert(text: string, now: Date): TablesInsert<'reminders'> | null {
  const title = text.trim().slice(0, TITLE_MAX)
  if (!title) return null
  return { title, due_at: defaultDueAt(now).toISOString(), repeat: 'none', assignee_id: null }
}
