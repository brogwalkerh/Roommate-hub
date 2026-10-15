import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { ToastProvider } from '../../components/ui/Toast'
import { qk } from '../../lib/queryClient'
import { useRealtime } from '../../lib/useRealtime'
import { fake } from './fakeSupabase'
import {
  useCompleteReminder,
  useCreateReminder,
  useDeleteReminder,
  useDueSoonReminders,
  useOpenReminders,
  useRecentlyDoneReminders,
  useUpdateReminder,
} from './hooks'

vi.mock('../../lib/supabase', async () => ({ supabase: (await import('./fakeSupabase')).fakeSupabase }))
vi.mock('../../lib/useRealtime', () => ({ useRealtime: vi.fn() }))

const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

function reminder(id: string, dueAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Reminder ${id}`,
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

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
  return { client, wrapper }
}

beforeEach(() => {
  fake.reset()
  vi.mocked(useRealtime).mockClear()
})

describe('useOpenReminders', () => {
  it('loads reminders that are not completed, soonest first, and listens for changes', async () => {
    fake.open = [reminder('a', at(HOUR)), reminder('b', at(2 * HOUR))]
    const { wrapper } = setup()
    const { result } = renderHook(() => useOpenReminders(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((r) => r.id)).toEqual(['a', 'b'])
    expect(fake.called('reminders', 'is')[0].args).toEqual(['completed_at', null])
    expect(fake.called('reminders', 'order')[0].args).toEqual(['due_at', { ascending: true }])
    expect(useRealtime).toHaveBeenCalledWith('reminders', qk.reminders)
  })

  it('reports a failed load', async () => {
    fake.error = { message: 'Failed to fetch' }
    const { wrapper } = setup()
    const { result } = renderHook(() => useOpenReminders(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useDueSoonReminders', () => {
  it('returns overdue reminders and those due within the window', async () => {
    fake.open = [
      reminder('overdue', at(-3 * HOUR)),
      reminder('soon', at(2 * HOUR)),
      reminder('later', at(30 * HOUR)),
      reminder('far', at(72 * HOUR)),
    ]
    const { wrapper } = setup()
    const { result } = renderHook(() => ({ day: useDueSoonReminders(), week: useDueSoonReminders(24 * 7) }), { wrapper })

    expect(result.current.day.isLoading).toBe(true)
    expect(result.current.day.reminders).toEqual([])
    await waitFor(() => expect(result.current.day.isLoading).toBe(false))
    expect(result.current.day.reminders.map((r) => r.id)).toEqual(['overdue', 'soon'])
    expect(result.current.week.reminders.map((r) => r.id)).toEqual(['overdue', 'soon', 'later', 'far'])
  })
})

describe('useRecentlyDoneReminders', () => {
  it('merges finished one-time reminders with the completion log of repeating ones', async () => {
    const dishesDone = at(-5 * HOUR)
    const trashDone = at(-2 * HOUR)
    fake.finished = [
      { id: 'dishes', title: 'Dishes', assignee_id: 'sam', repeat: 'none', completed_at: dishesDone, completed_by: 'sam' },
    ]
    fake.completions = [
      // complete_reminder also logs one-time reminders; this is the same event as above.
      { id: 'c0', reminder_id: 'dishes', completed_at: dishesDone, completed_by: 'sam', reminders: { title: 'Dishes', assignee_id: 'sam', repeat: 'none' } },
      { id: 'c1', reminder_id: 'trash', completed_at: trashDone, completed_by: 'me', reminders: { title: 'Trash', assignee_id: null, repeat: 'weekly' } },
    ]
    const { wrapper } = setup()
    const { result } = renderHook(() => useRecentlyDoneReminders(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((i) => [i.title, i.canUndo])).toEqual([
      ['Trash', true],
      ['Dishes', true],
    ])

    const since = new Date(String(fake.called('reminders', 'gte')[0].args[1])).getTime()
    expect(Date.now() - since).toBeGreaterThan(7 * 24 * HOUR - 60_000)
    expect(Date.now() - since).toBeLessThan(7 * 24 * HOUR + 60_000)
    expect(fake.called('reminder_completions', 'gte')).toHaveLength(1)
  })
})

describe('useCompleteReminder', () => {
  it('removes the reminder at once, completes it through the RPC and offers Undo', async () => {
    fake.open = [reminder('a', at(HOUR)), reminder('b', at(2 * HOUR))]
    let release!: () => void
    fake.rpcGate = new Promise<void>((resolve) => (release = resolve))
    const { wrapper } = setup()
    const { result } = renderHook(() => ({ open: useOpenReminders(), complete: useCompleteReminder() }), { wrapper })
    await waitFor(() => expect(result.current.open.data).toHaveLength(2))

    // The server's answer after completing: only "b" is still open.
    fake.open = [reminder('b', at(2 * HOUR))]
    act(() => result.current.complete.mutate('a'))
    await waitFor(() => expect(result.current.open.data?.map((r) => r.id)).toEqual(['b']))
    expect(screen.queryByText('Marked done')).not.toBeInTheDocument()

    release()
    expect(await screen.findByText('Marked done')).toBeInTheDocument()
    expect(fake.rpcCalls).toEqual([{ name: 'complete_reminder', args: { p_id: 'a' } }])

    fake.open = [reminder('a', at(HOUR)), reminder('b', at(2 * HOUR))]
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(fake.rpcCalls).toHaveLength(2))
    expect(fake.rpcCalls[1]).toEqual({ name: 'undo_complete_reminder', args: { p_id: 'a' } })
    await waitFor(() => expect(result.current.open.data?.map((r) => r.id)).toEqual(['a', 'b']))
  })

  it('brings the reminder back and says what went wrong when completing fails', async () => {
    fake.open = [reminder('a', at(HOUR))]
    fake.rpcError = { code: 'P0002', message: 'reminder_not_found' }
    const { wrapper } = setup()
    const { result } = renderHook(() => ({ open: useOpenReminders(), complete: useCompleteReminder() }), { wrapper })
    await waitFor(() => expect(result.current.open.data).toHaveLength(1))

    act(() => result.current.complete.mutate('a'))
    expect(await screen.findByText(/That reminder is gone/)).toBeInTheDocument()
    expect(screen.queryByText('Marked done')).not.toBeInTheDocument()
    await waitFor(() => expect(result.current.open.data?.map((r) => r.id)).toEqual(['a']))
  })
})

describe('create, update and delete', () => {
  it('creates a reminder and refreshes the lists', async () => {
    fake.saved = reminder('new', at(HOUR))
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateReminder(), { wrapper })

    const input = { title: 'Buy milk', due_at: at(HOUR), repeat: 'none' as const, assignee_id: null }
    let created
    await act(async () => {
      created = await result.current.mutateAsync(input)
    })
    expect(fake.called('reminders', 'insert')[0].args).toEqual([input])
    expect(created).toMatchObject({ id: 'new' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.reminders })
  })

  it('updates one reminder by id', async () => {
    fake.saved = reminder('r1', at(HOUR), { title: 'Renamed' })
    const { wrapper } = setup()
    const { result } = renderHook(() => useUpdateReminder(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'r1', patch: { title: 'Renamed' } })
    })
    expect(fake.called('reminders', 'update')[0].args).toEqual([{ title: 'Renamed' }])
    expect(fake.called('reminders', 'eq')[0].args).toEqual(['id', 'r1'])
  })

  it('treats an update that matched no row as a deleted reminder', async () => {
    fake.saved = null
    const { wrapper } = setup()
    const { result } = renderHook(() => useUpdateReminder(), { wrapper })

    act(() => result.current.mutate({ id: 'gone', patch: { title: 'x' } }))
    expect(await screen.findByText(/That reminder is gone/)).toBeInTheDocument()
  })

  it('deletes one reminder by id', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useDeleteReminder(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('r1')
    })
    expect(fake.called('reminders', 'delete')).toHaveLength(1)
    expect(fake.called('reminders', 'eq')[0].args).toEqual(['id', 'r1'])
  })

  it('shows a friendly error when a save fails', async () => {
    fake.error = { message: 'Failed to fetch' }
    const { wrapper } = setup()
    const { result } = renderHook(() => useDeleteReminder(), { wrapper })

    act(() => result.current.mutate('r1'))
    expect(await screen.findByText(/Can’t reach the server/)).toBeInTheDocument()
  })
})
