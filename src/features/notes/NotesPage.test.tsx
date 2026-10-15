import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from '../../components/ui/Toast'
import * as api from './api'
import type { Note } from './api'
import { sortNotes } from './noteText'
import NotesPage from './NotesPage'

vi.mock('./api', () => ({
  listNotes: vi.fn(),
  fetchNote: vi.fn(),
  createNote: vi.fn(),
  saveNote: vi.fn(),
  setNotePinned: vi.fn(),
  deleteNote: vi.fn(),
}))
vi.mock('../../lib/useRealtime', () => ({ useRealtime: () => {} }))

const { ME, SAM } = vi.hoisted(() => ({
  ME: { id: 'user-me', display_name: 'Alex', color: '#2c5ea6' },
  SAM: { id: 'user-sam', display_name: 'Sam', color: '#d9534f' },
}))
vi.mock('../../household/useHousehold', () => ({
  useMembers: () => ({
    me: ME,
    roommate: SAM,
    members: [ME, SAM],
    byId: (id: string | null | undefined) => [ME, SAM].find((m) => m.id === id) ?? null,
  }),
}))

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const stamp = (n: number) => `2026-10-15T09:00:00.${String(n).padStart(6, '0')}+00:00`

function makeNote(n: number, patch: Partial<Note> = {}): Note {
  return {
    id: uuid(n),
    title: `Note ${n}`,
    body: '',
    pinned: false,
    created_by: ME.id,
    updated_by: SAM.id,
    created_at: stamp(0),
    updated_at: stamp(n),
    ...patch,
  }
}

let rows: Note[]
let clock: number
const bump = () => `2026-10-15T09:30:00.${String(++clock).padStart(6, '0')}+00:00`

/** An in-memory notes table behind the mocked api module, with the same version check as the real one. */
function seedServer(initial: Note[]) {
  rows = initial
  clock = 0
  vi.mocked(api.listNotes).mockImplementation(async () => sortNotes(rows))
  vi.mocked(api.fetchNote).mockImplementation(async (id) => rows.find((r) => r.id === id) ?? null)
  vi.mocked(api.createNote).mockImplementation(async () => {
    const created = makeNote(90 + rows.length, { title: '', body: '', updated_by: ME.id, updated_at: bump() })
    rows = [...rows, created]
    return created
  })
  vi.mocked(api.saveNote).mockImplementation(async (id, content, base) => {
    const row = rows.find((r) => r.id === id)
    if (!row || (base !== null && base !== row.updated_at)) return null
    const saved = { ...row, ...content, updated_by: ME.id, updated_at: bump() }
    rows = rows.map((r) => (r.id === id ? saved : r))
    return saved
  })
  vi.mocked(api.setNotePinned).mockImplementation(async (id, pinned) => {
    const saved = { ...rows.find((r) => r.id === id)!, pinned, updated_by: ME.id, updated_at: bump() }
    rows = rows.map((r) => (r.id === id ? saved : r))
    return saved
  })
  vi.mocked(api.deleteNote).mockImplementation(async (id) => {
    rows = rows.filter((r) => r.id !== id)
  })
}

/** What the roommate does from their phone. */
function roommateEdits(id: string, patch: Partial<Note>) {
  rows = rows.map((r) => (r.id === id ? { ...r, ...patch, updated_by: SAM.id, updated_at: bump() } : r))
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Where />
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:noteId" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

// Some flows wait out the 800 ms autosave pause and the 2 s retry backoff in real time.
vi.setConfig({ testTimeout: 15_000 })

beforeAll(() => {
  // jsdom has no modal <dialog>.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T09:10:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('note list', () => {
  it('suggests a first note when there are none', async () => {
    seedServer([])
    renderAt('/notes')
    expect(await screen.findByText('No notes yet')).toBeInTheDocument()
    expect(screen.getByText(/a grocery list or house rules/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New note' })).toHaveLength(2)
  })

  it('shows pinned notes first, with title, preview and who edited when', async () => {
    seedServer([
      makeNote(1, { title: 'Chores', body: '# Chores\nTrash on **Tuesday**', updated_at: stamp(1) }),
      makeNote(2, { title: 'House rules', body: 'No shoes inside', pinned: true, updated_at: stamp(2) }),
      makeNote(3, { title: '', body: '# Wi-Fi\nNetwork: HubNet', updated_by: ME.id, updated_at: stamp(3) }),
    ])
    renderAt('/notes')

    const pinnedHeading = await screen.findByRole('heading', { name: 'Pinned' })
    expect(pinnedHeading).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Other notes' })).toBeInTheDocument()

    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.querySelector('.truncate')?.textContent)).toEqual(['House rules', 'Wi-Fi', 'Chores'])
    expect(links[0]).toHaveTextContent('No shoes inside')
    expect(links[0]).toHaveTextContent('Edited by Sam · 10 minutes ago')
    expect(links[1]).toHaveTextContent('Network: HubNet') // the heading became the title, so it isn't repeated
    expect(links[1]).toHaveTextContent('Edited by you')
    expect(links[2]).toHaveTextContent('Trash on Tuesday')
  })

  it('filters by title and text, ignoring case', async () => {
    seedServer([
      makeNote(1, { title: 'Groceries', body: '- milk\n- eggs' }),
      makeNote(2, { title: 'House rules', body: 'Quiet after 10pm' }),
    ])
    renderAt('/notes')
    const search = await screen.findByRole('searchbox', { name: 'Search notes' })

    fireEvent.change(search, { target: { value: 'EGGS' } })
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link')).toHaveTextContent('Groceries')

    fireEvent.change(search, { target: { value: 'quiet' } })
    expect(screen.getByRole('link')).toHaveTextContent('House rules')

    fireEvent.change(search, { target: { value: 'zebra' } })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('No matching notes')).toBeInTheDocument()
  })

  it('shows a retry when the list will not load', async () => {
    seedServer([])
    vi.mocked(api.listNotes).mockRejectedValueOnce(new Error('Failed to fetch'))
    renderAt('/notes')
    expect(await screen.findByText('Can’t reach the server. Check your connection and try again.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No notes yet')).toBeInTheDocument()
  })

  it('creates a note and opens it ready to type', async () => {
    seedServer([makeNote(1)])
    renderAt('/notes')
    await screen.findByRole('link', { name: /Note 1/ })

    fireEvent.click(screen.getByRole('button', { name: 'New note' }))
    const title = await screen.findByLabelText('Title')
    expect(api.createNote).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('where').textContent).toBe(`/notes/${rows.at(-1)!.id}`)
    await waitFor(() => expect(document.activeElement).toBe(title))
  })
})

describe('editor', () => {
  const id = uuid(1)

  it('autosaves typing after a pause, against the version it loaded', async () => {
    seedServer([makeNote(1, { title: 'Groceries', body: '- milk' })])
    renderAt(`/notes/${id}`)
    const body = await screen.findByLabelText('Note text')
    expect(body).toHaveValue('- milk')
    expect(screen.getByText('Saved')).toBeInTheDocument()

    fireEvent.change(body, { target: { value: '- milk\n- eggs' } })
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(api.saveNote).not.toHaveBeenCalled()

    await waitFor(() => expect(api.saveNote).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(api.saveNote).toHaveBeenCalledWith(id, { title: 'Groceries', body: '- milk\n- eggs' }, stamp(1))
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
    expect(screen.getAllByText(/Edited by you/).length).toBeGreaterThan(0)
  })

  it('saves on blur straight away', async () => {
    seedServer([makeNote(1)])
    renderAt(`/notes/${id}`)
    const title = await screen.findByLabelText('Title')
    fireEvent.change(title, { target: { value: 'Renamed' } })
    fireEvent.blur(title)
    await waitFor(() => expect(api.saveNote).toHaveBeenCalledWith(id, { title: 'Renamed', body: '' }, stamp(1)))
  })

  it('shows "Not saved, retrying" while a save fails, then recovers', async () => {
    seedServer([makeNote(1)])
    renderAt(`/notes/${id}`)
    const body = await screen.findByLabelText('Note text')
    vi.mocked(api.saveNote).mockRejectedValueOnce(new Error('Failed to fetch'))
    fireEvent.change(body, { target: { value: 'offline words' } })
    fireEvent.blur(body)
    expect(await screen.findByText('Not saved, retrying')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), { timeout: 4000 })
    expect(rows[0].body).toBe('offline words')
  })

  it('loads a roommate change silently when there is nothing unsaved', async () => {
    seedServer([makeNote(1, { title: 'Groceries', body: '- milk' })])
    const { queryClient } = renderAt(`/notes/${id}`)
    const body = await screen.findByLabelText('Note text')

    roommateEdits(id, { body: '- milk\n- bread' })
    const theirVersion = rows[0].updated_at
    await act(() => queryClient.invalidateQueries({ queryKey: ['notes'] })) // what a realtime event does
    await waitFor(() => expect(body).toHaveValue('- milk\n- bread'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Edited by Sam/).length).toBeGreaterThan(0)

    // Typing carries on from their version without a conflict.
    fireEvent.change(body, { target: { value: '- milk\n- bread\n- jam' } })
    fireEvent.blur(body)
    await waitFor(() => expect(api.saveNote).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.saveNote).mock.calls[0][2]).toBe(theirVersion)
    await waitFor(() => expect(rows[0].body).toBe('- milk\n- bread\n- jam'))
  })

  it('is not confused by the echo of its own saves (realtime refetches)', async () => {
    seedServer([makeNote(1, { title: 'Groceries', body: 'a' })])
    const { queryClient } = renderAt(`/notes/${id}`)
    const body = await screen.findByLabelText('Note text')
    const save = vi.mocked(api.saveNote).getMockImplementation()!
    vi.mocked(api.saveNote).mockImplementation(async (...args) => {
      const row = await save(...args)
      // Like a realtime event: refetch shortly after every save.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['notes'] }), 0)
      return row
    })

    fireEvent.change(body, { target: { value: 'ab' } })
    fireEvent.blur(body)
    await waitFor(() => expect(rows[0].body).toBe('ab'))
    fireEvent.change(body, { target: { value: 'abc' } })
    fireEvent.blur(body)
    await waitFor(() => expect(rows[0].body).toBe('abc'))
    fireEvent.change(body, { target: { value: 'abcd' } })
    fireEvent.blur(body)
    await waitFor(() => expect(rows[0].body).toBe('abcd'))
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())

    expect(body).toHaveValue('abcd')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(vi.mocked(api.saveNote).mock.calls.map((c) => c[2])).toEqual([stamp(1), expect.any(String), expect.any(String)])
  })

  it('sends pending edits when you leave the note', async () => {
    seedServer([makeNote(1, { title: 'Groceries', body: 'a' })])
    renderAt(`/notes/${id}`)
    fireEvent.change(await screen.findByLabelText('Note text'), { target: { value: 'typed, then left at once' } })
    expect(api.saveNote).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back to notes' }))
    await waitFor(() => expect(api.saveNote).toHaveBeenCalledWith(id, { title: 'Groceries', body: 'typed, then left at once' }, stamp(1)))
    expect(rows[0].body).toBe('typed, then left at once')
  })

  describe('when the roommate saved in between', () => {
    async function conflictedEditor() {
      seedServer([makeNote(1, { title: 'Groceries', body: '- milk' })])
      renderAt(`/notes/${id}`)
      const body = await screen.findByLabelText('Note text')
      roommateEdits(id, { body: '- milk\n- bread' })
      fireEvent.change(body, { target: { value: '- milk\n- eggs' } })
      fireEvent.blur(body)
      const banner = await screen.findByRole('alert')
      return { body, banner }
    }

    it('asks which version to keep', async () => {
      const { banner, body } = await conflictedEditor()
      expect(banner).toHaveTextContent('Sam changed this note while you were editing.')
      expect(within(banner).getByRole('button', { name: 'Keep my version' })).toBeInTheDocument()
      expect(within(banner).getByRole('button', { name: 'Load theirs' })).toBeInTheDocument()
      expect(body).toHaveValue('- milk\n- eggs') // my text stays put until I choose
      expect(screen.getByText('Not saved')).toBeInTheDocument()
    })

    it('"Keep my version" saves over theirs', async () => {
      const { banner, body } = await conflictedEditor()
      fireEvent.click(within(banner).getByRole('button', { name: 'Keep my version' }))
      await waitFor(() => expect(rows[0].body).toBe('- milk\n- eggs'))
      expect(vi.mocked(api.saveNote).mock.calls.at(-1)?.[2]).toBeNull()
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
      expect(body).toHaveValue('- milk\n- eggs')
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })

    it('"Load theirs" drops my edits', async () => {
      const { banner, body } = await conflictedEditor()
      fireEvent.click(within(banner).getByRole('button', { name: 'Load theirs' }))
      await waitFor(() => expect(body).toHaveValue('- milk\n- bread'))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(rows[0].body).toBe('- milk\n- bread')
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })
  })

  it('previews Markdown and saves a ticked checkbox', async () => {
    seedServer([makeNote(1, { title: 'Groceries', body: '# Buy\n\n- [ ] milk\n- [ ] eggs' })])
    renderAt(`/notes/${id}`)
    await screen.findByLabelText('Note text')

    fireEvent.click(screen.getByRole('radio', { name: 'Preview' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Buy' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Note text')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'eggs' }))
    await waitFor(() => expect(api.saveNote).toHaveBeenCalledTimes(1))
    expect(api.saveNote).toHaveBeenCalledWith(id, { title: 'Groceries', body: '# Buy\n\n- [ ] milk\n- [x] eggs' }, stamp(1))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'eggs' })).toBeChecked())

    fireEvent.click(screen.getByRole('radio', { name: 'Write' }))
    expect(await screen.findByLabelText('Note text')).toHaveValue('# Buy\n\n- [ ] milk\n- [x] eggs')
  })

  it('pins and unpins', async () => {
    seedServer([makeNote(1)])
    renderAt(`/notes/${id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Pin note' }))
    await waitFor(() => expect(api.setNotePinned).toHaveBeenCalledWith(id, true))
    expect(await screen.findByRole('button', { name: 'Unpin note' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('heading', { name: 'Pinned' })).toBeInTheDocument()
  })

  it('does not call a pin toggle a conflict, even with unsaved typing', async () => {
    seedServer([makeNote(1, { body: 'a' })])
    renderAt(`/notes/${id}`)
    const body = await screen.findByLabelText('Note text')
    fireEvent.change(body, { target: { value: 'a, typed before pinning' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pin note' }))
    await waitFor(() => expect(api.setNotePinned).toHaveBeenCalled())
    await waitFor(() => expect(rows[0].body).toBe('a, typed before pinning'), { timeout: 3000 })
    expect(rows[0].pinned).toBe(true)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks before deleting, then returns to the list', async () => {
    seedServer([makeNote(1, { title: 'Old list' }), makeNote(2, { title: 'Keeper' })])
    renderAt(`/notes/${id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete note' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('“Old list” will be deleted for both of you.')
    expect(api.deleteNote).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.deleteNote).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(api.deleteNote).toHaveBeenCalledWith(id))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/notes'))
    expect(await screen.findByText('Pick a note')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Old list/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Keeper/ })).toBeInTheDocument()
  })

  it('goes back to the list from the back button', async () => {
    seedServer([makeNote(1)])
    renderAt(`/notes/${id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Back to notes' }))
    expect(screen.getByTestId('where').textContent).toBe('/notes')
  })

  it.each([[uuid(77)], ['not-a-note-id']])('says so when the note %s does not exist', async (missing) => {
    seedServer([makeNote(1)])
    renderAt(`/notes/${missing}`)
    expect(await screen.findByText('This note is gone')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to notes' }))
    expect(screen.getByTestId('where').textContent).toBe('/notes')
  })
})
