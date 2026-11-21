import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../components/ui/Toast'
import { ShareLine } from './ShareLine'
import type { BillDebt } from './shares'

const people = vi.hoisted(() => ({
  me: { id: 'brogden', display_name: 'Brogden', color: '#2c5ea6' },
  roommate: { id: 'collin', display_name: 'Collin', color: '#7c3aed' },
}))

const fake = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  deleted: [] as Record<string, unknown>[],
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'settlements') throw new Error('unexpected table ' + table)
      return {
        insert: (row: Record<string, unknown>) => {
          fake.inserted.push(row)
          return { select: () => ({ single: async () => ({ data: { id: 's1', ...row }, error: null }) }) }
        },
        delete: () => ({
          eq: (col1: string, v1: string) => ({
            eq: async (col2: string, v2: string) => {
              fake.deleted.push({ [col1]: v1, [col2]: v2 })
              return { data: null, error: null }
            },
          }),
        }),
      }
    },
  },
}))
vi.mock('../../household/useHousehold', () => ({
  useMembers: () => ({
    me: people.me,
    roommate: people.roommate,
    members: [people.me, people.roommate],
    isLoading: false,
    byId: (id: string | null | undefined) => [people.me, people.roommate].find((p) => p.id === id) ?? null,
  }),
  useHousehold: () => ({ data: { timezone: 'UTC' } }),
}))
vi.mock('../../lib/useRealtime', () => ({ useRealtime: () => {} }))

const debt = (patch: Partial<BillDebt> = {}): BillDebt => ({
  bill_id: 'water',
  title: 'Water bill',
  due_on: '2026-11-17',
  paid_on: null,
  created_at: '2026-11-01T00:00:00Z',
  payer_id: 'brogden',
  user_id: 'collin',
  share_cents: 19065,
  paid_cents: 0,
  paid_back_on: null,
  ...patch,
})

function renderLine(d: BillDebt, undoable = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ShareLine debt={d} undoable={undoable} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fake.inserted = []
  fake.deleted = []
})

it('says what the roommate owes and records their payment against the bill', async () => {
  renderLine(debt())
  expect(screen.getByText('Collin owes you $190.65')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Collin paid: Water bill' }))
  await waitFor(() => expect(fake.inserted).toHaveLength(1))
  expect(fake.inserted[0]).toMatchObject({
    bill_id: 'water',
    from_user: 'collin',
    to_user: 'brogden',
    amount_cents: 19065,
  })
  expect(await screen.findByText('Recorded: Collin paid you back')).toBeInTheDocument()
})

it('offers “I paid” when it is my share, for what is still owed', async () => {
  renderLine(debt({ user_id: 'brogden', payer_id: 'collin', paid_cents: 9065 }))
  expect(screen.getByText('You have paid $90.65 of $190.65')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'I paid: Water bill' }))
  await waitFor(() => expect(fake.inserted).toHaveLength(1))
  expect(fake.inserted[0]).toMatchObject({ from_user: 'brogden', to_user: 'collin', amount_cents: 10000 })
})

it('shows a paid share with the date, and can take it back only where allowed', async () => {
  renderLine(debt({ paid_cents: 19065, paid_back_on: '2026-11-03' }))
  expect(screen.getByText('Collin paid you back Tue, Nov 3')).toBeInTheDocument()
  expect(screen.queryByRole('button')).toBeNull()

  renderLine(debt({ paid_cents: 19065, paid_back_on: '2026-11-03' }), true)
  await userEvent.click(screen.getByRole('button', { name: 'Not paid yet' }))
  await waitFor(() => expect(fake.deleted).toEqual([{ bill_id: 'water', from_user: 'collin' }]))
})
