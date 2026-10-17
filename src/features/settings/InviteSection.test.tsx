import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../components/ui/Toast'
import { InviteSection, inviteMessage } from './InviteSection'

const members = vi.hoisted(() => ({
  me: { id: 'me', display_name: 'Alex', color: '#2c5ea6' },
  roommate: null as null | { id: string; display_name: string; color: string },
  isLoading: false,
  byId: () => null,
}))

const fake = vi.hoisted(() => ({
  pending: [] as string[],
  rpc: vi.fn(),
}))
fake.rpc.mockImplementation(async (name: string, args?: { p_email: string }) => {
  if (name === 'pending_invites') return { data: fake.pending, error: null }
  if (name === 'create_invite') {
    if (args?.p_email === 'taken@example.com') return { data: null, error: { message: 'already_registered' } }
    fake.pending = [args!.p_email.toLowerCase()]
    return { data: 'QJ47-UCG6-KFK6-3BTR', error: null }
  }
  if (name === 'revoke_invite') {
    fake.pending = []
    return { data: null, error: null }
  }
  throw new Error('unexpected rpc ' + name)
})

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: fake.rpc } }))
vi.mock('../../household/useHousehold', () => ({ useMembers: () => members }))
vi.mock('../../lib/config', () => ({ config: { appUrl: 'https://example.github.io/Roommate-hub/' } }))

beforeEach(() => {
  fake.pending = []
  fake.rpc.mockClear()
  members.roommate = null
})

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <InviteSection />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

it('writes a message with the link, email and code', () => {
  const text = inviteMessage({ email: 'sam@example.com', code: 'AAAA-BBBB-CCCC-DDDD' }, 'https://x.test/app/')
  expect(text).toContain('https://x.test/app/')
  expect(text).toContain('Use the email sam@example.com')
  expect(text).toContain('Invite code: AAAA-BBBB-CCCC-DDDD')
})

it('creates an invite and copies the message', async () => {
  const user = userEvent.setup()
  renderSection()
  await user.type(screen.getByLabelText('Their email'), 'Sam@Example.com')
  await user.click(screen.getByRole('button', { name: 'Create invite' }))

  expect(await screen.findByText('QJ47-UCG6-KFK6-3BTR')).toBeInTheDocument()
  expect(fake.rpc).toHaveBeenCalledWith('create_invite', { p_email: 'Sam@Example.com' })
  expect(screen.getByText('sam@example.com')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Copy message' }))
  expect(await navigator.clipboard.readText()).toContain('Invite code: QJ47-UCG6-KFK6-3BTR')
  expect(await screen.findByText(/Message copied/)).toBeInTheDocument()
})

it('explains a taken email', async () => {
  const user = userEvent.setup()
  renderSection()
  await user.type(screen.getByLabelText('Their email'), 'taken@example.com')
  await user.click(screen.getByRole('button', { name: 'Create invite' }))
  expect(await screen.findByText('That email already has an account. Sign in instead.')).toBeInTheDocument()
})

it('shows a waiting invite with new-code and cancel', async () => {
  fake.pending = ['sam@example.com']
  const user = userEvent.setup()
  renderSection()
  expect(await screen.findByText('sam@example.com')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(fake.rpc).toHaveBeenCalledWith('revoke_invite', { p_email: 'sam@example.com' }))
  expect(await screen.findByText(/Enter their email/)).toBeInTheDocument()
})

it('says so once the roommate has joined', () => {
  members.roommate = { id: 'sam', display_name: 'Sam', color: '#b0452f' }
  renderSection()
  expect(screen.getByText(/Sam has joined/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Their email')).not.toBeInTheDocument()
  expect(fake.rpc).not.toHaveBeenCalled()
})
