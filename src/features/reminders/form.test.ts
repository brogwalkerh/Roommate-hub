import { emptyForm, formFromReminder, parseDueInput, quickAddInsert, toInsert, toUpdate, validateForm } from './form'
import type { Reminder } from './logic'

const reminder: Reminder = {
  id: 'r1',
  title: 'Take out the trash',
  notes: 'Bins go out front',
  due_at: new Date(2026, 9, 20, 18, 30).toISOString(),
  repeat: 'weekly',
  repeat_anchor: new Date(2026, 9, 20, 18, 30).toISOString(),
  assignee_id: 'sam',
  completed_at: null,
  completed_by: null,
  created_by: 'me',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

describe('emptyForm', () => {
  it('starts at the next full hour, not repeating, for both of you', () => {
    expect(emptyForm(new Date(2026, 9, 15, 14, 20))).toEqual({
      title: '',
      notes: '',
      due: '2026-10-15T15:00',
      repeat: 'none',
      assigneeId: null,
    })
  })

  it('starts at 9 AM tomorrow late in the evening', () => {
    expect(emptyForm(new Date(2026, 9, 15, 22, 5)).due).toBe('2026-10-16T09:00')
  })
})

describe('formFromReminder', () => {
  it('converts the due time to the local datetime-local format', () => {
    expect(formFromReminder(reminder)).toEqual({
      title: 'Take out the trash',
      notes: 'Bins go out front',
      due: '2026-10-20T18:30',
      repeat: 'weekly',
      assigneeId: 'sam',
    })
  })

  it('turns missing notes into an empty field', () => {
    expect(formFromReminder({ ...reminder, notes: null }).notes).toBe('')
  })
})

describe('parseDueInput', () => {
  it('turns a local datetime into an ISO timestamp for the same moment', () => {
    const iso = parseDueInput('2026-10-20T18:30')
    expect(iso).toMatch(/Z$|[+-]\d\d:\d\d$/)
    expect(new Date(iso as string).getTime()).toBe(new Date(2026, 9, 20, 18, 30).getTime())
  })

  it('rejects empty and invalid input instead of throwing', () => {
    expect(parseDueInput('')).toBeNull()
    expect(parseDueInput('not a date')).toBeNull()
  })
})

describe('validateForm', () => {
  const valid = formFromReminder(reminder)

  it('accepts a complete form', () => {
    expect(validateForm(valid)).toEqual({})
  })

  it('requires a title that is more than spaces', () => {
    expect(validateForm({ ...valid, title: '' }).title).toBeTruthy()
    expect(validateForm({ ...valid, title: '   ' }).title).toBeTruthy()
  })

  it('limits the title to 200 characters, like the database', () => {
    expect(validateForm({ ...valid, title: 'a'.repeat(200) }).title).toBeUndefined()
    expect(validateForm({ ...valid, title: 'a'.repeat(201) }).title).toBeTruthy()
  })

  it('requires a due date and time', () => {
    expect(validateForm({ ...valid, due: '' }).due).toBeTruthy()
  })
})

describe('toInsert', () => {
  it('trims text, drops blank notes and sends the due time as ISO', () => {
    const insert = toInsert({ title: '  Water plants ', notes: '  ', due: '2026-10-20T18:30', repeat: 'daily', assigneeId: null })
    expect(insert).toEqual({
      title: 'Water plants',
      notes: null,
      due_at: new Date(2026, 9, 20, 18, 30).toISOString(),
      repeat: 'daily',
      assignee_id: null,
    })
  })
})

describe('toUpdate', () => {
  const initial = formFromReminder(reminder)

  it('leaves due_at out when the due time is unchanged, so the repeat schedule is not restarted', () => {
    const patch = toUpdate({ ...initial, title: 'Take out the bins' }, initial)
    expect(patch).not.toHaveProperty('due_at')
    expect(patch).toEqual({ title: 'Take out the bins', notes: 'Bins go out front', repeat: 'weekly', assignee_id: 'sam' })
  })

  it('sends due_at when the person changes it', () => {
    const patch = toUpdate({ ...initial, due: '2026-10-21T07:00' }, initial)
    expect(patch.due_at).toBe(new Date(2026, 9, 21, 7, 0).toISOString())
  })

  it('can clear the notes and reassign to both of you', () => {
    const patch = toUpdate({ ...initial, notes: '', assigneeId: null }, initial)
    expect(patch.notes).toBeNull()
    expect(patch.assignee_id).toBeNull()
  })
})

describe('quickAddInsert', () => {
  it('creates a one-time reminder for both of you at the default time', () => {
    expect(quickAddInsert('  Buy milk ', new Date(2026, 9, 15, 14, 20))).toEqual({
      title: 'Buy milk',
      due_at: new Date(2026, 9, 15, 15, 0).toISOString(),
      repeat: 'none',
      assignee_id: null,
    })
  })

  it('ignores blank text', () => {
    expect(quickAddInsert('   ', new Date())).toBeNull()
    expect(quickAddInsert('', new Date())).toBeNull()
  })

  it('cuts overlong text to the title limit', () => {
    expect(quickAddInsert('a'.repeat(250), new Date())?.title).toHaveLength(200)
  })
})
