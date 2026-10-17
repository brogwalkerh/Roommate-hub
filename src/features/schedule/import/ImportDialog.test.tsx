import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../../components/ui/Toast'
import { ImportDialog } from './ImportDialog'

const members = vi.hoisted(() => {
  const me = { id: 'me', display_name: 'Alex', color: '#2c5ea6' }
  const roommate = { id: 'sam', display_name: 'Sam', color: '#b0452f' }
  return { me, roommate, members: [me, roommate], byId: () => null }
})

// Supabase stand-in: invoke returns `parsed`, the events lookup returns `existing`, inserts are recorded.
const fake = vi.hoisted(() => {
  const state = {
    parsed: { data: null as unknown, error: null as unknown },
    existing: [] as unknown[],
    inserted: [] as unknown[],
    invoke: vi.fn(),
  }
  state.invoke.mockImplementation(async () => state.parsed)
  const from = () => ({
    select: () => ({ or: async () => ({ data: state.existing, error: null }) }),
    insert: async (rows: unknown[]) => {
      state.inserted.push(...rows)
      return { data: null, error: null }
    },
  })
  return { state, supabase: { functions: { invoke: state.invoke }, from } }
})

vi.mock('../../../lib/supabase', () => ({ supabase: fake.supabase }))
vi.mock('../../../household/useHousehold', () => ({ useMembers: () => members }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  fake.state.existing = []
  fake.state.inserted = []
  fake.state.invoke.mockClear()
})

const event = (o: Record<string, unknown>) => ({
  title: 'Work',
  date: '2026-10-20',
  endDate: '2026-10-20',
  allDay: false,
  startTime: '09:00',
  endTime: '17:00',
  location: 'Café Rio',
  notes: '',
  ...o,
})

function renderDialog(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ImportDialog onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return onClose
}

async function pickAndRead(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!
  await user.upload(input, file)
  await user.click(screen.getByRole('button', { name: 'Read schedule' }))
}

it('reads a schedule, lets you review it, and adds the chosen events', async () => {
  fake.state.parsed = {
    data: {
      events: [
        event({}),
        event({ date: '2026-10-21' }),
        event({ title: 'Night shift', date: '2026-10-22', startTime: '22:00', endTime: '06:00', location: '' }),
      ],
      warnings: ['One row was hard to read.'],
    },
    error: null,
  }
  fake.state.existing = [{ title: 'Work', all_day: false, starts_at: new Date('2026-10-21T09:00').toISOString(), start_date: null }]
  const user = userEvent.setup()
  const onClose = renderDialog()

  expect(screen.getByRole('button', { name: 'Read schedule' })).toBeDisabled()
  await pickAndRead(user, new File(['Mon,9-5'], 'rota.csv', { type: 'text/csv' }))

  expect(await screen.findByText('One row was hard to read.')).toBeInTheDocument()
  expect(fake.state.invoke).toHaveBeenCalledWith('parse-schedule', {
    body: expect.objectContaining({ source: { type: 'text', data: 'Mon,9-5' }, filename: 'rota.csv' }),
  })
  // The second Work is already on the calendar, so it starts unticked.
  const boxes = screen.getAllByRole('checkbox', { name: /^Add / })
  expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, false, true])
  expect(screen.getByText('Already on the calendar')).toBeInTheDocument()

  // Rename the night shift, then add for the whole household.
  const names = screen.getAllByRole('textbox', { name: 'Name' })
  await user.clear(names[2])
  await user.type(names[2], 'Late shift')
  await user.click(screen.getByRole('radio', { name: /Household/ }))
  await user.click(screen.getByRole('button', { name: 'Add 2 events' }))

  await waitFor(() => expect(onClose).toHaveBeenCalled())
  expect(fake.state.inserted).toEqual([
    expect.objectContaining({ title: 'Work', owner_id: null, location: 'Café Rio', starts_at: new Date('2026-10-20T09:00').toISOString() }),
    expect.objectContaining({
      title: 'Late shift',
      owner_id: null,
      starts_at: new Date('2026-10-22T22:00').toISOString(),
      ends_at: new Date('2026-10-23T06:00').toISOString(),
    }),
  ])
})

it('defaults the owner to me and blocks rows with problems', async () => {
  fake.state.parsed = { data: { events: [event({})], warnings: [] }, error: null }
  const user = userEvent.setup()
  renderDialog()
  await pickAndRead(user, new File(['x'], 'rota.csv', { type: 'text/csv' }))

  await user.clear(await screen.findByRole('textbox', { name: 'Name' }))
  expect(screen.getByText('Add a name.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add 1 event' })).toBeDisabled()

  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Work')
  await user.click(screen.getByRole('button', { name: 'Add 1 event' }))
  await waitFor(() => expect(fake.state.inserted).toEqual([expect.objectContaining({ owner_id: 'me' })]))
})

it('explains errors from the reader', async () => {
  const { FunctionsHttpError } = await import('@supabase/supabase-js')
  fake.state.parsed = {
    data: null,
    error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'ai_not_configured' }), { status: 503 })),
  }
  const user = userEvent.setup()
  renderDialog()
  await pickAndRead(user, new File(['x'], 'rota.csv', { type: 'text/csv' }))
  expect(await screen.findByText(/needs its Anthropic API key/)).toBeInTheDocument()
})

it('refuses files it cannot read before uploading', async () => {
  const user = userEvent.setup({ applyAccept: false })
  renderDialog()
  await user.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, new File(['x'], 'archive.zip', { type: 'application/zip' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Pick a PDF, a photo or screenshot, or a spreadsheet')
  expect(screen.getByRole('button', { name: 'Read schedule' })).toBeDisabled()
  expect(fake.state.invoke).not.toHaveBeenCalled()
})
