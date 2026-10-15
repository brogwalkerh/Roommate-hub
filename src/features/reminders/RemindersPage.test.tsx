import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '../../components/ui/Toast'
import { fake } from './fakeSupabase'
import RemindersPage from './RemindersPage'

const members = vi.hoisted(() => {
  const me = { id: 'me', display_name: 'Alex', color: '#2c5ea6' }
  const roommate = { id: 'sam', display_name: 'Sam', color: '#b0452f' }
  const all = [me, roommate]
  return { me, roommate, byId: (id: string | null) => all.find((m) => m.id === id) ?? null }
})

vi.mock('../../lib/supabase', async () => ({ supabase: (await import('./fakeSupabase')).fakeSupabase }))
vi.mock('../../lib/useRealtime', () => ({ useRealtime: vi.fn() }))
vi.mock('../../household/useHousehold', () => ({ useMembers: () => members }))

// Thursday, October 15 2026, noon. Only the clock is faked; timers and promises run normally.
const NOW = new Date(2026, 9, 15, 12, 0)
const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString()

function row(id: string, title: string, dueAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title,
    notes: null,
    due_at: dueAt,
    repeat: 'none',
    repeat_anchor: dueAt,
    assignee_id: null,
    completed_at: null,
    completed_by: null,
    notified_due_at: null,
    created_by: null,
    created_at: dueAt,
    updated_at: dueAt,
    ...extra,
  }
}

function seed() {
  fake.open = [
    row('rent', 'Pay rent', local(14, 9), { assignee_id: 'me' }),
    row('books', 'Return books', local(15, 15), { assignee_id: 'sam' }),
    row('plants', 'Water plants', local(15, 18), { repeat: 'weekly' }),
    row('landlord', 'Call landlord', local(16, 10), { assignee_id: 'me' }),
    row('dentist', 'Dentist', local(22, 8, 30), { assignee_id: 'sam', repeat: 'biweekly' }),
  ]
  fake.finished = [
    { id: 'dishes', title: 'Do the dishes', assignee_id: 'sam', repeat: 'none', completed_at: local(14, 20), completed_by: 'sam' },
  ]
  fake.completions = [
    { id: 'c1', reminder_id: 'plants', completed_at: local(15, 8), completed_by: 'me', reminders: { title: 'Water plants', assignee_id: null, repeat: 'weekly' } },
  ]
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <RemindersPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const section = (name: string) => within(screen.getByRole('region', { name }))

beforeAll(() => {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

beforeEach(() => {
  fake.reset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RemindersPage', () => {
  it('shows a loading state, then groups open reminders into Overdue, Today and Upcoming', async () => {
    seed()
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading reminders')

    expect(await screen.findByRole('checkbox', { name: 'Pay rent' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reminders', level: 1 })).toBeInTheDocument()

    expect(section('Overdue').getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Pay rent'])
    expect(section('Today').getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual([
      'Return books',
      'Water plants',
    ])
    expect(section('Upcoming').getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual([
      'Call landlord',
      'Dentist',
    ])
  })

  it('shows due text, repeat badges and who each reminder is for', async () => {
    seed()
    renderPage()
    await screen.findByRole('checkbox', { name: 'Pay rent' })

    expect(section('Overdue').getByText('Yesterday, 9:00 AM')).toBeInTheDocument()
    expect(section('Overdue').getByText('Overdue:')).toBeInTheDocument()
    expect(section('Today').getByText('Today, 6:00 PM')).toBeInTheDocument()
    expect(section('Today').getByText('Every week')).toBeInTheDocument()
    expect(section('Upcoming').getByText('Every 2 weeks')).toBeInTheDocument()
    expect(section('Today').getByText('Both')).toBeInTheDocument()
    expect(section('Today').getByText('Sam')).toBeInTheDocument()
    expect(section('Overdue').getByText('Alex')).toBeInTheDocument()
  })

  it('filters by Mine (including both of you) and by the roommate', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('checkbox', { name: 'Pay rent' })

    await user.click(screen.getByRole('radio', { name: 'Mine' }))
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual([
      'Pay rent',
      'Water plants',
      'Call landlord',
    ])

    await user.click(screen.getByRole('radio', { name: 'Sam' }))
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Return books', 'Dentist'])

    await user.click(screen.getByRole('radio', { name: 'All' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
  })

  it('completes a reminder from its checkbox', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()
    const checkbox = await screen.findByRole('checkbox', { name: 'Return books' })
    // The fake server forgets nothing on its own, so play its side: after completing, "books" is no longer open.
    fake.open = fake.open.filter((r) => r.id !== 'books')
    await user.click(checkbox)

    await waitFor(() => expect(fake.rpcCalls).toEqual([{ name: 'complete_reminder', args: { p_id: 'books' } }]))
    expect(await screen.findByText('Marked done')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Return books' })).not.toBeInTheDocument()
    // Ticking the circle must not open the editor.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the editor when the row is tapped, with the delete step inside the dialog', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Dentist'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit reminder' })
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Dentist')
    expect(within(dialog).getByLabelText('Due')).toHaveValue('2026-10-22T08:30')
    expect(within(dialog).getByLabelText('Repeat')).toHaveValue('biweekly')
    expect(within(dialog).getByRole('radio', { name: 'Sam' })).toBeChecked()

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('dialog', { name: 'Delete reminder?' })).toHaveTextContent('Dentist')
    expect(fake.called('reminders', 'delete')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Delete reminder' }))
    await waitFor(() => expect(fake.called('reminders', 'delete')).toHaveLength(1))
    expect(fake.called('reminders', 'eq').at(-1)?.args).toEqual(['id', 'dentist'])
  })

  it('saves edits without touching due_at when the due time is unchanged', async () => {
    seed()
    fake.saved = row('landlord', 'Call the landlord', local(16, 10), { assignee_id: 'me' })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Call landlord'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit reminder' })
    const title = within(dialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Call the landlord')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(fake.called('reminders', 'update')).toHaveLength(1))
    expect(fake.called('reminders', 'update')[0].args[0]).toEqual({
      title: 'Call the landlord',
      notes: null,
      repeat: 'none',
      assignee_id: 'me',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('adds a reminder from the dialog and asks for a title first', async () => {
    seed()
    fake.saved = row('new', 'Buy filter', local(15, 13))
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('checkbox', { name: 'Pay rent' })

    await user.click(screen.getByRole('button', { name: 'Add reminder' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add reminder' })
    expect(within(dialog).getByLabelText('Due')).toHaveValue('2026-10-15T13:00')
    expect(within(dialog).getByRole('radio', { name: 'Both of you' })).toBeChecked()

    await user.click(within(dialog).getByRole('button', { name: 'Add reminder' }))
    expect(await within(dialog).findByText('Give the reminder a title.')).toBeInTheDocument()
    expect(fake.called('reminders', 'insert')).toHaveLength(0)

    await user.type(within(dialog).getByLabelText('Title'), 'Buy filter')
    await user.selectOptions(within(dialog).getByLabelText('Repeat'), 'monthly')
    await user.click(within(dialog).getByRole('radio', { name: 'Alex' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add reminder' }))

    await waitFor(() => expect(fake.called('reminders', 'insert')).toHaveLength(1))
    expect(fake.called('reminders', 'insert')[0].args[0]).toEqual({
      title: 'Buy filter',
      notes: null,
      due_at: local(15, 13),
      repeat: 'monthly',
      assignee_id: 'me',
    })
  })

  it('adds a reminder from the quick-add field with Enter', async () => {
    seed()
    fake.saved = row('new', 'Buy milk', local(15, 13))
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('checkbox', { name: 'Pay rent' })

    await user.type(screen.getByPlaceholderText('Add a reminder, then press Enter'), 'Buy milk{Enter}')

    await waitFor(() => expect(fake.called('reminders', 'insert')).toHaveLength(1))
    expect(fake.called('reminders', 'insert')[0].args[0]).toEqual({
      title: 'Buy milk',
      due_at: local(15, 13),
      repeat: 'none',
      assignee_id: null,
    })
    expect(await screen.findByText('Added for Today, 1:00 PM')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add a reminder, then press Enter')).toHaveValue('')
  })

  it('lists what was done in the last 7 days in a collapsible section with Undo', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('checkbox', { name: 'Pay rent' })

    const toggle = screen.getByRole('button', { name: /Done in the last 7 days \(2\)/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Do the dishes')).not.toBeVisible()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Do the dishes')).toBeVisible()
    expect(screen.getByText('Done Yesterday, 8:00 PM · Sam')).toBeVisible()
    expect(screen.getByText('Done Today, 8:00 AM · Alex')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Undo Water plants' }))
    await waitFor(() => expect(fake.rpcCalls).toEqual([{ name: 'undo_complete_reminder', args: { p_id: 'plants' } }]))
  })

  it('shows a friendly empty state with an example', async () => {
    renderPage()
    expect(await screen.findByText('Nothing to remember yet')).toBeInTheDocument()
    expect(screen.getByText(/Take out the trash, every Tuesday/)).toBeInTheDocument()
    expect(screen.queryByText(/Done in the last 7 days/)).not.toBeInTheDocument()
  })

  it('says everything is done when only finished reminders exist', async () => {
    fake.finished = [
      { id: 'dishes', title: 'Do the dishes', assignee_id: 'sam', repeat: 'none', completed_at: local(14, 20), completed_by: 'sam' },
    ]
    renderPage()
    expect(await screen.findByText('You’re all caught up')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Done in the last 7 days \(1\)/ })).toBeInTheDocument()
  })

  it('explains an empty filter', async () => {
    fake.open = [row('rent', 'Pay rent', local(14, 9), { assignee_id: 'me' })]
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('checkbox', { name: 'Pay rent' })
    await user.click(screen.getByRole('radio', { name: 'Sam' }))
    expect(screen.getByText('Nothing for Sam')).toBeInTheDocument()
  })

  it('shows an error with a retry when loading fails', async () => {
    fake.error = { message: 'Failed to fetch' }
    const user = userEvent.setup()
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Can’t reach the server')

    fake.error = null
    seed()
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('checkbox', { name: 'Pay rent' })).toBeInTheDocument()
  })

  it('hints at notifications unless they are already on', async () => {
    seed()
    vi.stubGlobal('Notification', { permission: 'default' })
    const first = renderPage()
    const link = await screen.findByRole('link', { name: 'turn on notifications in Settings' })
    expect(link).toHaveAttribute('href', '/settings')
    expect(link.parentElement).toHaveTextContent('Get a notification when something’s due: turn on notifications in Settings')
    first.unmount()

    vi.stubGlobal('Notification', { permission: 'granted' })
    renderPage()
    await screen.findByRole('checkbox', { name: 'Pay rent' })
    expect(screen.queryByRole('link', { name: /notifications/ })).not.toBeInTheDocument()
  })

  it('leaves out the notification hint where notifications are unsupported', async () => {
    seed()
    vi.stubGlobal('Notification', undefined)
    renderPage()
    await screen.findByRole('checkbox', { name: 'Pay rent' })
    expect(screen.queryByText(/Get a notification/)).not.toBeInTheDocument()
  })
})
