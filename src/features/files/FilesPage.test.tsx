import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../components/ui/Toast'
import type { HouseholdFile } from './hooks'
import FilesPage from './FilesPage'

// The page is tested against stubbed data hooks: no Supabase, no network.
const mocks = vi.hoisted(() => ({
  files: { data: undefined as unknown[] | undefined, isPending: false, isError: false, error: null as unknown },
  deleteMutate: vi.fn(),
  uploadStart: vi.fn(),
  previewUrl: null as string | null,
}))

vi.mock('./hooks', () => {
  const mutation = (mutate = vi.fn()) => ({ mutate, reset: vi.fn(), isPending: false, error: null })
  return {
    useFiles: () => ({ ...mocks.files, refetch: vi.fn() }),
    useThumbnailUrls: () => ({}),
    useUploads: () => ({ items: [], busy: false, start: mocks.uploadStart, retry: vi.fn(), dismiss: vi.fn(), clearFinished: vi.fn() }),
    useDownloadFile: () => mutation(),
    useRenameFile: () => mutation(),
    useMoveFile: () => mutation(),
    useDeleteFile: () => mutation(mocks.deleteMutate),
    usePreviewUrl: (file: unknown) => ({
      url: file ? mocks.previewUrl : null,
      error: null,
      loading: false,
    }),
  }
})

vi.mock('../../household/useHousehold', () => ({
  useMembers: () => ({
    byId: (id: string | null) => (id === 'u1' ? { id: 'u1', display_name: 'Sam', color: '#2c5ea6' } : null),
  }),
}))

function file(overrides: Partial<HouseholdFile>): HouseholdFile {
  return {
    id: 'f1',
    storage_path: 'abc/file.pdf',
    name: 'file.pdf',
    folder: '',
    size_bytes: 2048,
    mime_type: 'application/pdf',
    uploaded_by: 'u1',
    created_at: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
    ...overrides,
  }
}

const FILES = [
  file({ id: 'f1', name: 'Lease 2026.pdf', folder: 'Lease', storage_path: 'a/Lease-2026.pdf' }),
  file({ id: 'f2', name: 'Wi-Fi card.jpg', folder: '', mime_type: 'image/jpeg', storage_path: 'b/Wi-Fi-card.jpg', size_bytes: 3_400_000 }),
  file({ id: 'f3', name: 'Dishwasher manual.pdf', folder: 'Manuals', uploaded_by: null, storage_path: 'c/Dishwasher-manual.pdf' }),
]

// jsdom has no matchMedia. `wide` answers every query: true is a desktop, false is a phone.
function mockScreen(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

function renderPage() {
  return render(
    <ToastProvider>
      <FilesPage />
    </ToastProvider>,
  )
}

beforeEach(() => {
  mocks.files = { data: FILES, isPending: false, isError: false, error: null }
  mocks.deleteMutate.mockReset()
  mocks.uploadStart.mockReset()
  mocks.previewUrl = null
  mockScreen(false)
  // jsdom has no modal <dialog> support.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

describe('FilesPage', () => {
  it('shows the limits note under the header', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Files' })).toBeInTheDocument()
    expect(screen.getByText('Up to 50 MB per file. Only the two of you can see these.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
  })

  it('shows a loading state, then an error state with a retry', () => {
    mocks.files = { data: undefined, isPending: true, isError: false, error: null }
    const { unmount } = renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading files')
    unmount()

    mocks.files = { data: undefined, isPending: false, isError: true, error: new Error('Failed to fetch') }
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Can’t reach the server')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('suggests what to keep when there are no files', () => {
    mocks.files = { data: [], isPending: false, isError: false, error: null }
    renderPage()
    expect(screen.getByRole('heading', { name: 'No files yet' })).toBeInTheDocument()
    expect(screen.getByText(/the lease, the Wi-Fi card, appliance manuals/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload files' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument()
  })

  it('lists folders as chips, Unfiled last, and filters by folder', async () => {
    const user = userEvent.setup()
    renderPage()
    const chips = within(screen.getByRole('group', { name: 'Folders' }))
    const labels = chips.getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['All 3', 'Lease 1', 'Manuals 1', 'Unfiled 1', 'New folder'])

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    await user.click(chips.getByRole('button', { name: /^Lease/ }))
    expect(chips.getByRole('button', { name: /^Lease/ })).toHaveAttribute('aria-pressed', 'true')
    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('Lease 2026.pdf')
    expect(cards[0]).toHaveTextContent('Sam')
    expect(cards[0]).toHaveTextContent('2 KB')
    expect(cards[0]).toHaveTextContent('2 days ago')
  })

  it('shows the uploader as Someone when the profile is gone', () => {
    renderPage()
    const card = screen.getByText('Dishwasher manual.pdf').closest('li')!
    expect(card).toHaveTextContent('Someone')
  })

  it('asks before deleting', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Actions for Lease 2026.pdf' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Open',
      'Download',
      'Rename',
      'Move',
      'Delete',
    ])
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete file?' })
    expect(dialog).toHaveTextContent('Lease 2026.pdf will be deleted for both of you')
    expect(mocks.deleteMutate).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(mocks.deleteMutate).toHaveBeenCalledTimes(1)
    expect(mocks.deleteMutate.mock.calls[0][0]).toMatchObject({ id: 'f1' })
  })

  it('opens a preview with an inline image', async () => {
    const user = userEvent.setup()
    mocks.previewUrl = 'https://example.test/signed.jpg'
    renderPage()
    await user.click(screen.getByText('Wi-Fi card.jpg'))
    const dialog = await screen.findByRole('dialog', { name: 'Preview' })
    expect(within(dialog).getByRole('img', { name: 'Wi-Fi card.jpg' })).toHaveAttribute('src', mocks.previewUrl)
    expect(within(dialog).getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('offers an Open PDF link on phones', async () => {
    const user = userEvent.setup()
    mocks.previewUrl = 'https://example.test/signed.pdf'
    mockScreen(false)
    renderPage()
    await user.click(screen.getByText('Lease 2026.pdf'))
    const dialog = await screen.findByRole('dialog', { name: 'Preview' })
    expect(within(dialog).getByRole('link', { name: 'Open PDF' })).toHaveAttribute('href', mocks.previewUrl)
    expect(dialog.querySelector('iframe')).toBeNull()
  })

  it('shows the PDF in a frame on wide screens', async () => {
    const user = userEvent.setup()
    mocks.previewUrl = 'https://example.test/signed.pdf'
    mockScreen(true)
    renderPage()
    await user.click(screen.getByText('Lease 2026.pdf'))
    const dialog = await screen.findByRole('dialog', { name: 'Preview' })
    expect(dialog.querySelector('iframe')).toHaveAttribute('src', mocks.previewUrl)
    expect(within(dialog).queryByRole('link', { name: 'Open PDF' })).toBeNull()
  })

  describe('uploading', () => {
    const MB = 1024 * 1024
    const pick = async (user: ReturnType<typeof userEvent.setup>, container: HTMLElement, files: File[]) => {
      await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, files)
      return screen.findByRole('dialog', { name: 'Upload files' })
    }
    const bigFile = () => {
      const big = new File(['x'], 'huge.mov', { type: 'video/quicktime' })
      Object.defineProperty(big, 'size', { value: 60 * MB })
      return big
    }

    it('reviews picked files, flags a file over 50 MB, and uploads the rest to Unfiled', async () => {
      const user = userEvent.setup()
      const { container } = renderPage()
      const ok = new File(['hello'], 'manual.pdf', { type: 'application/pdf' })
      const dialog = await pick(user, container, [ok, bigFile()])

      expect(within(dialog).getByText('manual.pdf')).toBeInTheDocument()
      expect(within(dialog).getByText('This file is 60 MB, over the 50 MB limit.')).toBeInTheDocument()
      expect(within(dialog).getByRole('combobox', { name: 'Folder' })).toHaveDisplayValue('Unfiled')

      await user.click(within(dialog).getByRole('button', { name: 'Upload' }))
      expect(mocks.uploadStart).toHaveBeenCalledTimes(1)
      expect(mocks.uploadStart).toHaveBeenCalledWith([ok], '')
      expect(screen.queryByRole('dialog', { name: 'Upload files' })).toBeNull()
    })

    it('cannot upload when every file is over the limit', async () => {
      const user = userEvent.setup()
      const { container } = renderPage()
      const dialog = await pick(user, container, [bigFile()])
      expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled()
    })

    it('defaults to the folder being viewed and reuses a folder typed in any case', async () => {
      const user = userEvent.setup()
      const { container } = renderPage()
      await user.click(within(screen.getByRole('group', { name: 'Folders' })).getByRole('button', { name: /^Manuals/ }))
      const file = new File(['a'], 'oven.pdf', { type: 'application/pdf' })
      const dialog = await pick(user, container, [file])
      const folder = within(dialog).getByRole('combobox', { name: 'Folder' })
      expect(folder).toHaveDisplayValue('Manuals')

      await user.selectOptions(folder, 'New folder…')
      await user.type(within(dialog).getByRole('textbox', { name: 'New folder name' }), '  lease ')
      await user.click(within(dialog).getByRole('button', { name: 'Upload' }))
      expect(mocks.uploadStart).toHaveBeenCalledWith([file], 'Lease')
    })

    it('creates a folder by choosing it as the upload target', async () => {
      const user = userEvent.setup()
      renderPage()
      await user.click(screen.getByRole('button', { name: 'New folder' }))
      const dialog = await screen.findByRole('dialog', { name: 'Upload files' })
      expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled()

      await user.type(within(dialog).getByRole('textbox', { name: 'New folder name' }), 'Taxes')
      const file = new File(['a'], 'w2.pdf', { type: 'application/pdf' })
      await user.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, file)
      await user.click(within(dialog).getByRole('button', { name: 'Upload' }))
      expect(mocks.uploadStart).toHaveBeenCalledWith([file], 'Taxes')
    })

    it('asks for a folder name before uploading to a new folder', async () => {
      const user = userEvent.setup()
      const { container } = renderPage()
      const dialog = await pick(user, container, [new File(['a'], 'a.pdf', { type: 'application/pdf' })])
      await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Folder' }), 'New folder…')
      await user.click(within(dialog).getByRole('button', { name: 'Upload' }))
      expect(within(dialog).getByText('Enter a folder name.')).toBeInTheDocument()
      expect(mocks.uploadStart).not.toHaveBeenCalled()
    })

    it('shows a drop overlay while dragging files, then stages the dropped files', async () => {
      renderPage()
      const dropped = new File(['a'], 'lease-scan.pdf', { type: 'application/pdf' })
      const transfer = {
        types: ['Files'],
        files: [dropped],
        items: [{ kind: 'file', getAsFile: () => dropped, webkitGetAsEntry: () => ({ isDirectory: false }) }],
      }
      const send = (type: string) =>
        fireEvent(window, Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer: transfer }))

      send('dragenter')
      expect(await screen.findByText('Drop files to upload')).toBeInTheDocument()
      send('drop')
      expect(screen.queryByText('Drop files to upload')).toBeNull()
      const dialog = await screen.findByRole('dialog', { name: 'Upload files' })
      expect(within(dialog).getByText('lease-scan.pdf')).toBeInTheDocument()
    })

    it('ignores drags that are not files', () => {
      renderPage()
      fireEvent(
        window,
        Object.assign(new Event('dragenter', { bubbles: true, cancelable: true }), { dataTransfer: { types: ['text/plain'] } }),
      )
      expect(screen.queryByText('Drop files to upload')).toBeNull()
    })
  })
})
