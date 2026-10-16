import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ToastProvider } from '../../components/ui/Toast'
import {
  useDeleteFile,
  useDownloadFile,
  useFiles,
  useMoveFile,
  useRecentFiles,
  useRenameFile,
  useThumbnailUrls,
  useUploads,
  type HouseholdFile,
} from './hooks'

// Supabase is replaced by a recorder: storage calls are mocks, table calls return whatever `db` holds.
const fake = vi.hoisted(() => {
  const db: { result: { data: unknown; error: unknown }; calls: Array<[string, unknown[]]> } = {
    result: { data: null, error: null },
    calls: [],
  }
  const storage = {
    upload: vi.fn(),
    remove: vi.fn(),
    createSignedUrl: vi.fn(),
    createSignedUrls: vi.fn(),
  }
  function chain() {
    const c: Record<string, unknown> = {}
    for (const method of ['insert', 'update', 'delete', 'select', 'eq', 'order', 'limit', 'single', 'maybeSingle']) {
      c[method] = (...args: unknown[]) => {
        db.calls.push([method, args])
        return c
      }
    }
    c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(db.result).then(resolve, reject)
    return c
  }
  const channel: Record<string, unknown> = {}
  channel.on = vi.fn(() => channel)
  channel.subscribe = vi.fn(() => channel)
  return { db, storage, chain, channel }
})

vi.mock('../../lib/supabase', () => ({
  STORAGE_BUCKET: 'household',
  supabase: {
    storage: { from: () => fake.storage },
    from: () => fake.chain(),
    channel: () => fake.channel,
    removeChannel: vi.fn(),
  },
}))

const MB = 1024 * 1024
const ok = { data: { path: 'x' }, error: null }

function row(overrides: Partial<HouseholdFile> = {}): HouseholdFile {
  return {
    id: 'row-1',
    storage_path: 'uuid-1/report.pdf',
    name: 'report.pdf',
    folder: '',
    size_bytes: 10,
    mime_type: 'application/pdf',
    uploaded_by: null,
    created_at: '2026-10-15T00:00:00Z',
    ...overrides,
  }
}

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

const callsTo = (method: string) => fake.db.calls.filter(([m]) => m === method).map(([, args]) => args)

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  fake.db.result = { data: row(), error: null }
  fake.db.calls = []
  fake.storage.upload.mockReset().mockResolvedValue(ok)
  fake.storage.remove.mockReset().mockResolvedValue({ data: [], error: null })
  fake.storage.createSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: 'https://example.test/one' }, error: null })
  fake.storage.createSignedUrls.mockReset()
})

describe('useFiles and useRecentFiles', () => {
  it('lists every file newest first and listens for the roommate’s changes', async () => {
    fake.db.result = { data: [row({ id: 'a' }), row({ id: 'b' })], error: null }
    const { result } = renderHook(() => useFiles(), { wrapper })
    await waitFor(() => expect(result.current.data).toHaveLength(2))

    expect(callsTo('order')[0]).toEqual(['created_at', { ascending: false }])
    expect(callsTo('limit')).toHaveLength(0)
    expect(fake.channel.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({ table: 'files' }), expect.any(Function))
    // Realtime invalidates by the table's root key, so every key must start with it.
    expect(client.getQueryCache().getAll().every((q) => q.queryKey[0] === 'files')).toBe(true)
  })

  it('limits the Home list to the newest N', async () => {
    fake.db.result = { data: [row()], error: null }
    const { result } = renderHook(() => useRecentFiles(4), { wrapper })
    await waitFor(() => expect(result.current.data).toHaveLength(1))

    expect(callsTo('order')[0]).toEqual(['created_at', { ascending: false }])
    expect(callsTo('limit')[0]).toEqual([4])
    expect(fake.channel.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({ table: 'files' }), expect.any(Function))
    expect(client.getQueryCache().getAll().every((q) => q.queryKey[0] === 'files')).toBe(true)
  })

  it('surfaces a failed load as an error', async () => {
    fake.db.result = { data: null, error: { message: 'Failed to fetch' } }
    const { result } = renderHook(() => useFiles(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useUploads', () => {
  it('stores the object under a unique, safe path, then adds the row', async () => {
    const { result } = renderHook(() => useUploads(), { wrapper })
    const file = new File(['hello'], 'My Report (final).pdf', { type: 'application/pdf' })

    act(() => result.current.start([file], 'Lease'))
    expect(result.current.items[0]).toMatchObject({ status: expect.stringMatching(/queued|uploading/), folder: 'Lease' })
    await waitFor(() => expect(result.current.items[0].status).toBe('done'))

    const [path, body, options] = fake.storage.upload.mock.calls[0]
    expect(path).toMatch(/^[0-9a-f-]{36}\/My-Report-final\.pdf$/)
    expect(body).toBeInstanceOf(Blob)
    expect(body).toMatchObject({ type: 'application/pdf', size: 5 })
    expect(options).toMatchObject({ contentType: 'application/pdf', upsert: false })

    expect(callsTo('insert')[0][0]).toEqual({
      storage_path: path,
      name: 'My Report (final).pdf',
      folder: 'Lease',
      size_bytes: 5,
      mime_type: 'application/pdf',
    })
    expect(fake.storage.remove).not.toHaveBeenCalled()
  })

  it('stores files that could run script as plain downloads', async () => {
    const { result } = renderHook(() => useUploads(), { wrapper })
    act(() => result.current.start([new File(['<script></script>'], 'page.html', { type: 'text/html' })], ''))
    await waitFor(() => expect(result.current.items[0].status).toBe('done'))

    const [, body, options] = fake.storage.upload.mock.calls[0]
    expect(body).toMatchObject({ type: 'application/octet-stream' })
    expect(options).toMatchObject({ contentType: 'application/octet-stream' })
  })

  it('removes the stored object when the row insert fails', async () => {
    fake.db.result = { data: null, error: { message: 'new row violates row-level security policy' } }
    const { result } = renderHook(() => useUploads(), { wrapper })

    act(() => result.current.start([new File(['hello'], 'a.png', { type: 'image/png' })], ''))
    await waitFor(() => expect(result.current.items[0].status).toBe('failed'))

    const uploadedPath = fake.storage.upload.mock.calls[0][0]
    expect(fake.storage.remove).toHaveBeenCalledWith([uploadedPath])
    expect(result.current.items[0].error).toContain('row-level security')
  })

  it('still reports the insert failure if cleanup also fails', async () => {
    fake.db.result = { data: null, error: { message: 'insert failed' } }
    fake.storage.remove.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useUploads(), { wrapper })

    act(() => result.current.start([new File(['x'], 'a.png', { type: 'image/png' })], ''))
    await waitFor(() => expect(result.current.items[0].status).toBe('failed'))
    expect(result.current.items[0].error).toBe('insert failed')
  })

  it('rejects a file over 50 MB before uploading anything', async () => {
    const { result } = renderHook(() => useUploads(), { wrapper })
    const big = new File(['x'], 'movie.mov', { type: 'video/quicktime' })
    Object.defineProperty(big, 'size', { value: 51 * MB })

    act(() => result.current.start([big], ''))
    await waitFor(() => expect(result.current.items[0].status).toBe('failed'))
    expect(result.current.items[0].error).toBe('This file is 51 MB, over the 50 MB limit.')
    expect(fake.storage.upload).not.toHaveBeenCalled()
    expect(callsTo('insert')).toHaveLength(0)
  })

  it('does not add a row when the storage upload fails, and a retry can succeed', async () => {
    fake.storage.upload.mockResolvedValueOnce({ data: null, error: { message: 'The object exceeded the maximum allowed size' } })
    const { result } = renderHook(() => useUploads(), { wrapper })

    act(() => result.current.start([new File(['x'], 'a.png')], ''))
    await waitFor(() => expect(result.current.items[0].status).toBe('failed'))
    expect(result.current.items[0].error).toBe('That file is over the 50 MB limit.')
    expect(callsTo('insert')).toHaveLength(0)

    act(() => result.current.retry(result.current.items[0].id))
    await waitFor(() => expect(result.current.items[0].status).toBe('done'))
    expect(callsTo('insert')).toHaveLength(1)
  })

  it('uploads several files with a status for each and at most three at a time', async () => {
    let running = 0
    let peak = 0
    fake.storage.upload.mockImplementation(async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return ok
    })
    const { result } = renderHook(() => useUploads(), { wrapper })
    const files = ['a', 'b', 'c', 'd', 'e'].map((n) => new File(['x'], `${n}.txt`, { type: 'text/plain' }))

    act(() => result.current.start(files, 'Notes'))
    expect(result.current.items).toHaveLength(5)
    await waitFor(() => expect(result.current.items.every((i) => i.status === 'done')).toBe(true))
    expect(peak).toBe(3)
    expect(callsTo('insert')).toHaveLength(5)
  })

  it('lets a failed file be dismissed', async () => {
    fake.storage.upload.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useUploads(), { wrapper })
    act(() => result.current.start([new File(['x'], 'a.png')], ''))
    await waitFor(() => expect(result.current.items[0].status).toBe('failed'))
    act(() => result.current.dismiss(result.current.items[0].id))
    expect(result.current.items).toHaveLength(0)
  })
})

describe('useDeleteFile', () => {
  it('removes the stored object, then the row', async () => {
    const { result } = renderHook(() => useDeleteFile(), { wrapper })
    await act(() => result.current.mutateAsync(row()))
    expect(fake.storage.remove).toHaveBeenCalledWith(['uuid-1/report.pdf'])
    expect(callsTo('delete')).toHaveLength(1)
    expect(callsTo('eq')[0]).toEqual(['id', 'row-1'])
  })

  it('still deletes the row when the object is already gone', async () => {
    fake.storage.remove.mockResolvedValue({ data: null, error: { statusCode: '404', message: 'Object not found' } })
    const { result } = renderHook(() => useDeleteFile(), { wrapper })
    await act(() => result.current.mutateAsync(row()))
    expect(callsTo('delete')).toHaveLength(1)
  })

  it('keeps the row when removing the object fails for another reason', async () => {
    fake.storage.remove.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    const { result } = renderHook(() => useDeleteFile(), { wrapper })
    await expect(act(() => result.current.mutateAsync(row()))).rejects.toMatchObject({ message: 'Failed to fetch' })
    expect(callsTo('delete')).toHaveLength(0)
  })
})

describe('useRenameFile and useMoveFile', () => {
  it('rename changes the name only', async () => {
    const { result } = renderHook(() => useRenameFile(), { wrapper })
    await act(() => result.current.mutateAsync({ id: 'row-1', name: '  Lease 2026.pdf ' }))
    expect(callsTo('update')[0][0]).toEqual({ name: 'Lease 2026.pdf' })
    expect(callsTo('eq')[0]).toEqual(['id', 'row-1'])
    expect(fake.storage.upload).not.toHaveBeenCalled()
  })

  it('move changes the folder only, and "" means Unfiled', async () => {
    const { result } = renderHook(() => useMoveFile(), { wrapper })
    await act(() => result.current.mutateAsync({ id: 'row-1', folder: '' }))
    expect(callsTo('update')[0][0]).toEqual({ folder: '' })
  })

  it('says so when the file was deleted meanwhile', async () => {
    fake.db.result = { data: null, error: null }
    const { result } = renderHook(() => useMoveFile(), { wrapper })
    await expect(act(() => result.current.mutateAsync({ id: 'gone', folder: 'Lease' }))).rejects.toThrow(
      'That file no longer exists.',
    )
  })
})

describe('useDownloadFile', () => {
  it('signs a 60-second link that downloads under the file name, then clicks it', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { result } = renderHook(() => useDownloadFile(), { wrapper })
    await act(() => result.current.mutateAsync(row({ name: 'Lease 2026.pdf' })))
    expect(fake.storage.createSignedUrl).toHaveBeenCalledWith('uuid-1/report.pdf', 60, { download: 'Lease 2026.pdf' })
    expect(click).toHaveBeenCalledTimes(1)
    click.mockRestore()
  })

  it('explains a missing object', async () => {
    fake.storage.createSignedUrl.mockResolvedValue({ data: null, error: { statusCode: '404', message: 'Object not found' } })
    const { result } = renderHook(() => useDownloadFile(), { wrapper })
    await expect(act(() => result.current.mutateAsync(row()))).rejects.toThrow(/missing from storage/)
  })
})

describe('useThumbnailUrls', () => {
  const image = (n: number, overrides: Partial<HouseholdFile> = {}) =>
    row({ id: `img-${n}`, storage_path: `thumb-test/${n}.jpg`, name: `${n}.jpg`, mime_type: 'image/jpeg', ...overrides })
  const signed = (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://example.test/${path}?token=${Math.random()}`, signedURL: '', error: null })),
    error: null,
  })

  it('signs every visible image in one batch for an hour, skipping other kinds and huge images', async () => {
    fake.storage.createSignedUrls.mockImplementation(async (paths: string[]) => signed(paths))
    const files = [
      image(1),
      image(2),
      row({ id: 'pdf', storage_path: 'thumb-test/doc.pdf' }),
      image(3, { size_bytes: 20 * MB }),
    ]
    const { result } = renderHook(() => useThumbnailUrls(files), { wrapper })
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2))

    expect(fake.storage.createSignedUrls).toHaveBeenCalledTimes(1)
    expect(fake.storage.createSignedUrls).toHaveBeenCalledWith(['thumb-test/1.jpg', 'thumb-test/2.jpg'], 3600)
    expect(result.current['thumb-test/1.jpg']).toContain('thumb-test/1.jpg')
  })

  it('reuses saved URLs and signs only the new image when the list grows', async () => {
    fake.storage.createSignedUrls.mockImplementation(async (paths: string[]) => signed(paths))
    const first = [image(11), image(12)]
    const { result, rerender } = renderHook(({ files }) => useThumbnailUrls(files), {
      wrapper,
      initialProps: { files: first },
    })
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2))
    const before = { ...result.current }

    rerender({ files: [...first, image(13)] })
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(3))
    expect(fake.storage.createSignedUrls).toHaveBeenCalledTimes(2)
    expect(fake.storage.createSignedUrls).toHaveBeenLastCalledWith(['thumb-test/13.jpg'], 3600)
    expect(result.current['thumb-test/11.jpg']).toBe(before['thumb-test/11.jpg'])
    expect(result.current['thumb-test/12.jpg']).toBe(before['thumb-test/12.jpg'])
  })

  it('leaves out an image that could not be signed', async () => {
    fake.storage.createSignedUrls.mockResolvedValue({
      data: [
        { path: 'thumb-test/21.jpg', signedUrl: 'https://example.test/21', signedURL: '', error: null },
        { path: 'thumb-test/22.jpg', signedUrl: null, signedURL: null, error: 'Object not found' },
      ],
      error: null,
    })
    const { result } = renderHook(() => useThumbnailUrls([image(21), image(22)]), { wrapper })
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(1))
    expect(result.current['thumb-test/22.jpg']).toBeUndefined()
  })

  it('makes no request when there are no images', () => {
    renderHook(() => useThumbnailUrls([row()]), { wrapper })
    expect(fake.storage.createSignedUrls).not.toHaveBeenCalled()
  })
})
