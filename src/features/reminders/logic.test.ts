import {
  buildDoneItems,
  defaultDueAt,
  dueSoon,
  filterReminders,
  groupReminders,
  isOverdue,
  matchesFilter,
  REPEAT_OPTIONS,
  reminderError,
  repeatLabel,
  type CompletionRow,
} from './logic'

// Dates are built from local parts, so these tests hold in any time zone.
const local = (month: number, day: number, hour = 0, minute = 0, second = 0) =>
  new Date(2026, month - 1, day, hour, minute, second)
const due = (date: Date, id = '') => ({ due_at: date.toISOString(), id })

describe('groupReminders', () => {
  const now = local(10, 15, 14, 30)

  it('splits overdue, later today and upcoming at local midnight', () => {
    const groups = groupReminders(
      [
        due(local(10, 16, 0, 0), 'tomorrow-midnight'),
        due(local(10, 15, 23, 59), 'tonight'),
        due(local(10, 15, 9, 0), 'this-morning'),
        due(local(10, 14, 23, 59), 'last-night'),
        due(local(10, 20, 8, 0), 'next-week'),
      ],
      now,
    )
    expect(groups.overdue.map((r) => r.id)).toEqual(['last-night', 'this-morning'])
    expect(groups.today.map((r) => r.id)).toEqual(['tonight'])
    expect(groups.upcoming.map((r) => r.id)).toEqual(['tomorrow-midnight', 'next-week'])
  })

  it('treats a reminder due this very minute as today, not overdue', () => {
    const groups = groupReminders([due(now, 'now')], now)
    expect(groups.overdue).toEqual([])
    expect(groups.today.map((r) => r.id)).toEqual(['now'])
  })

  it('sorts each group soonest first and leaves the input alone', () => {
    const input = [due(local(10, 15, 20), 'b'), due(local(10, 15, 16), 'a')]
    const groups = groupReminders(input, now)
    expect(groups.today.map((r) => r.id)).toEqual(['a', 'b'])
    expect(input.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('returns empty groups for no reminders', () => {
    expect(groupReminders([], now)).toEqual({ overdue: [], today: [], upcoming: [] })
  })

  it('moves a reminder from today to overdue as time passes', () => {
    const reminder = due(local(10, 15, 15, 0), 'r')
    expect(groupReminders([reminder], local(10, 15, 14, 59)).today).toHaveLength(1)
    expect(groupReminders([reminder], local(10, 15, 15, 1)).overdue).toHaveLength(1)
  })
})

describe('isOverdue', () => {
  it('is true only once the due time has passed', () => {
    const now = local(10, 15, 12, 0)
    expect(isOverdue(due(local(10, 15, 11, 59)), now)).toBe(true)
    expect(isOverdue(due(local(10, 15, 12, 0)), now)).toBe(false)
    expect(isOverdue(due(local(10, 15, 12, 1)), now)).toBe(false)
  })
})

describe('dueSoon', () => {
  const now = local(10, 15, 12, 0)
  const items = [
    due(local(10, 17, 12, 0), 'in-2-days'),
    due(local(10, 16, 12, 0), 'in-24h'),
    due(local(10, 16, 12, 1), 'just-past-24h'),
    due(local(10, 15, 13, 0), 'in-1h'),
    due(local(10, 13, 8, 0), 'overdue'),
  ]

  it('keeps overdue items and those due within the window, soonest first', () => {
    expect(dueSoon(items, now, 24).map((r) => r.id)).toEqual(['overdue', 'in-1h', 'in-24h'])
  })

  it('honours a custom window', () => {
    expect(dueSoon(items, now, 2).map((r) => r.id)).toEqual(['overdue', 'in-1h'])
    expect(dueSoon(items, now, 72).map((r) => r.id)).toHaveLength(5)
  })
})

describe('repeatLabel', () => {
  it.each([
    ['none', ''],
    ['daily', 'Every day'],
    ['weekly', 'Every week'],
    ['biweekly', 'Every 2 weeks'],
    ['monthly', 'Every month'],
  ] as const)('labels %s as %j', (repeat, label) => {
    expect(repeatLabel(repeat)).toBe(label)
  })

  it('offers every repeat rule once in the form select', () => {
    expect(REPEAT_OPTIONS.map((o) => o.value)).toEqual(['none', 'daily', 'weekly', 'biweekly', 'monthly'])
    expect(REPEAT_OPTIONS[0].label).toBe('Doesn’t repeat')
  })
})

describe('defaultDueAt', () => {
  it.each([
    [local(10, 15, 14, 20), local(10, 15, 15, 0)],
    [local(10, 15, 14, 0), local(10, 15, 15, 0)], // exactly on the hour: the next one
    [local(10, 15, 14, 59, 59), local(10, 15, 15, 0)],
    [local(10, 15, 3, 10), local(10, 15, 4, 0)],
    [local(10, 15, 20, 59), local(10, 15, 21, 0)], // 9 PM itself is still fine
  ])('%s -> %s', (now, expected) => {
    expect(defaultDueAt(now).getTime()).toBe(expected.getTime())
  })

  it.each([
    [local(10, 15, 21, 0), local(10, 16, 9, 0)],
    [local(10, 15, 21, 30), local(10, 16, 9, 0)],
    [local(10, 15, 23, 45), local(10, 16, 9, 0)],
    [local(10, 31, 22, 0), local(11, 1, 9, 0)], // rolls over the end of the month
    [local(12, 31, 22, 0), new Date(2027, 0, 1, 9, 0)], // and the end of the year
  ])('after 9 PM (%s) it is 9:00 AM tomorrow', (now, expected) => {
    expect(defaultDueAt(now).getTime()).toBe(expected.getTime())
  })

  it('does not change the date it was given', () => {
    const now = local(10, 15, 14, 20)
    const copy = now.getTime()
    defaultDueAt(now)
    expect(now.getTime()).toBe(copy)
  })
})

describe('filters', () => {
  const people = { meId: 'me', roommateId: 'sam' }
  const mine = { assignee_id: 'me', id: 'mine' }
  const theirs = { assignee_id: 'sam', id: 'theirs' }
  const both = { assignee_id: null, id: 'both' }
  const all = [mine, theirs, both]

  it('All shows everything', () => {
    expect(filterReminders(all, 'all', people)).toEqual(all)
  })

  it('Mine includes reminders for both of you', () => {
    expect(filterReminders(all, 'mine', people).map((r) => r.id)).toEqual(['mine', 'both'])
  })

  it('the roommate’s filter shows only what is assigned to them', () => {
    expect(filterReminders(all, 'roommate', people).map((r) => r.id)).toEqual(['theirs'])
  })

  it('copes with profiles that have not loaded yet', () => {
    const unknown = { meId: null, roommateId: null }
    expect(matchesFilter(null, 'mine', unknown)).toBe(true)
    expect(matchesFilter('me', 'mine', unknown)).toBe(false)
    expect(matchesFilter(null, 'roommate', unknown)).toBe(false)
    expect(matchesFilter('sam', 'roommate', unknown)).toBe(false)
  })
})

describe('buildDoneItems', () => {
  const shape = { assignee_id: null, repeat: 'none' as const }
  const completion = (
    id: string,
    reminderId: string,
    completedAt: string,
    reminder: CompletionRow['reminders'] = { title: 'Trash', assignee_id: null, repeat: 'weekly' },
  ): CompletionRow => ({ id, reminder_id: reminderId, completed_at: completedAt, completed_by: 'me', reminders: reminder })

  it('lists finished one-time reminders and repeating completions, newest first', () => {
    const items = buildDoneItems(
      [{ id: 'dishes', title: 'Dishes', completed_at: '2026-10-14T10:00:00+00:00', completed_by: 'sam', ...shape }],
      [completion('c1', 'trash', '2026-10-15T08:00:00+00:00'), completion('c2', 'trash', '2026-10-08T08:00:00+00:00')],
    )
    expect(items.map((i) => i.title)).toEqual(['Trash', 'Dishes', 'Trash'])
    expect(items[1]).toMatchObject({ reminderId: 'dishes', completedBy: 'sam', repeat: 'none' })
    expect(items[0]).toMatchObject({ reminderId: 'trash', repeat: 'weekly', completedBy: 'me' })
  })

  it('lists a one-time reminder once even though complete_reminder also logs a completion for it', () => {
    const items = buildDoneItems(
      [{ id: 'dishes', title: 'Dishes', completed_at: '2026-10-14T10:00:00.123+00:00', completed_by: 'sam', ...shape }],
      [completion('c1', 'dishes', '2026-10-14T10:00:00.123Z', { title: 'Dishes', assignee_id: null, repeat: 'none' })],
    )
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('reminder:dishes')
  })

  it('keeps earlier completions of a reminder that was repeating before it was finished', () => {
    const items = buildDoneItems(
      [{ id: 'r', title: 'Plants', completed_at: '2026-10-15T10:00:00Z', completed_by: 'me', ...shape }],
      [
        completion('c2', 'r', '2026-10-15T10:00:00Z', { title: 'Plants', assignee_id: null, repeat: 'none' }),
        completion('c1', 'r', '2026-10-12T10:00:00Z', { title: 'Plants', assignee_id: null, repeat: 'none' }),
      ],
    )
    expect(items.map((i) => i.key)).toEqual(['reminder:r', 'completion:c1'])
  })

  it('lets only the latest completion of each reminder be undone', () => {
    const items = buildDoneItems(
      [],
      [
        completion('c1', 'trash', '2026-10-08T08:00:00Z'),
        completion('c3', 'trash', '2026-10-15T08:00:00Z'),
        completion('c2', 'trash', '2026-10-12T08:00:00Z'),
        completion('c4', 'plants', '2026-10-13T08:00:00Z', { title: 'Plants', assignee_id: null, repeat: 'weekly' }),
      ],
    )
    expect(items.map((i) => [i.key, i.canUndo])).toEqual([
      ['completion:c3', true],
      ['completion:c4', true],
      ['completion:c2', false],
      ['completion:c1', false],
    ])
  })

  it('skips completions whose reminder cannot be read and open reminders without a finish time', () => {
    expect(
      buildDoneItems(
        [{ id: 'open', title: 'Open', completed_at: null, completed_by: null, ...shape }],
        [completion('c1', 'gone', '2026-10-15T08:00:00Z', null)],
      ),
    ).toEqual([])
  })
})

describe('reminderError', () => {
  it('explains a reminder that was deleted', () => {
    expect(reminderError({ code: 'P0002', message: 'reminder_not_found' })).toMatch(/gone/)
    expect(reminderError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toMatch(
      /gone/,
    )
  })

  it('explains nothing to undo', () => {
    expect(reminderError({ message: 'nothing_to_undo' })).toMatch(/nothing left to undo/)
  })

  it('falls back to the app-wide wording', () => {
    expect(reminderError(new Error('Failed to fetch'))).toMatch(/Can’t reach the server/)
    expect(reminderError({ message: 'something odd' })).toBe('something odd')
  })
})
