import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../../components/ui/Toast'
import type { Tables, TablesUpdate } from '../../lib/database.types'
import { friendlyError, unwrap } from '../../lib/errors'
import { qk } from '../../lib/queryClient'
import { STORAGE_BUCKET, supabase } from '../../lib/supabase'
import { storageContentType } from '../../lib/contentTypes'
import { useRealtime } from '../../lib/useRealtime'
import { canThumbnail, clampFileName, isMissingObjectError, safeStorageName, validateUpload } from './fileUtils'
import { runWithConcurrency, summarizeUploads, type UploadStatus } from './uploadQueue'
import { createSignedUrlCache } from './urlCache'

export type HouseholdFile = Tables<'files'>

const storage = () => supabase.storage.from(STORAGE_BUCKET)

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Every file, newest first. */
export function useFiles() {
  useRealtime('files', qk.files)
  return useQuery({
    queryKey: [...qk.files, 'all'],
    queryFn: async () =>
      unwrap(await supabase.from('files').select('*').order('created_at', { ascending: false })),
  })
}

/** The newest `limit` files, for the Home dashboard. */
export function useRecentFiles(limit: number) {
  useRealtime('files', qk.files)
  return useQuery({
    queryKey: [...qk.files, 'recent', limit],
    queryFn: async () =>
      unwrap(await supabase.from('files').select('*').order('created_at', { ascending: false }).limit(limit)),
  })
}

// ---------------------------------------------------------------------------
// Signed URLs
// ---------------------------------------------------------------------------

/**
 * Thumbnail URLs last an hour. The memory below reuses a URL until it has under 20 minutes left and
 * the query goes stale after 15, so a URL on screen always has at least 5 minutes of life when
 * it is next checked, and a refetch hands back the same string (the <img> doesn't reload).
 */
const THUMBNAIL_TTL_SECONDS = 60 * 60
const THUMBNAIL_STALE_MS = 15 * 60_000
const PREVIEW_TTL_SECONDS = 10 * 60
const DOWNLOAD_TTL_SECONDS = 60

const thumbnailUrls = createSignedUrlCache()

const NO_URLS: Record<string, string> = {}

async function signThumbnails(paths: string[]): Promise<Record<string, string>> {
  const urls: Record<string, string> = {}
  const missing: string[] = []
  for (const path of paths) {
    const saved = thumbnailUrls.get(path)
    if (saved) urls[path] = saved
    else missing.push(path)
  }
  if (missing.length > 0) {
    const { data, error } = await storage().createSignedUrls(missing, THUMBNAIL_TTL_SECONDS)
    if (error) throw error
    for (const row of data) {
      // A row with an error means that object is gone: it just gets the kind icon.
      if (row.path && row.signedUrl && !row.error) {
        thumbnailUrls.set(row.path, row.signedUrl, THUMBNAIL_TTL_SECONDS)
        urls[row.path] = row.signedUrl
      }
    }
  }
  return urls
}

/**
 * Signed thumbnail URLs for the images in `files`, fetched in one batch, keyed by storage path.
 * Pass the files that are on screen. Images over the thumbnail size limit are skipped.
 */
export function useThumbnailUrls(files: readonly HouseholdFile[]): Record<string, string> {
  const paths = useMemo(
    () =>
      files
        .filter(canThumbnail)
        .map((f) => f.storage_path)
        .sort(),
    [files],
  )
  const query = useQuery({
    queryKey: [...qk.files, 'thumbnails', paths],
    queryFn: () => signThumbnails(paths),
    enabled: paths.length > 0,
    staleTime: THUMBNAIL_STALE_MS,
    placeholderData: keepPreviousData,
  })
  return query.data ?? NO_URLS
}

async function signOne(path: string, seconds: number, download?: string): Promise<string> {
  const { data, error } = await storage().createSignedUrl(path, seconds, download ? { download } : undefined)
  if (error) {
    if (isMissingObjectError(error)) throw new Error('This file is missing from storage. Delete it and upload it again.')
    throw error
  }
  return data.signedUrl
}

/**
 * A URL for showing one file in the preview dialog (10 minutes). Loaded once per opened file,
 * not through React Query, so a roommate's upload can't swap the URL under an open preview.
 */
export function usePreviewUrl(file: HouseholdFile | null) {
  const path = file?.storage_path ?? null
  const [result, setResult] = useState<{ path: string; url: string | null; error: unknown } | null>(null)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    signOne(path, PREVIEW_TTL_SECONDS).then(
      (url) => {
        if (!cancelled) setResult({ path, url, error: null })
      },
      (error: unknown) => {
        if (!cancelled) setResult({ path, url: null, error })
      },
    )
    return () => {
      cancelled = true
    }
  }, [path])

  const current = result && result.path === path ? result : null
  return { url: current?.url ?? null, error: current?.error ?? null, loading: path !== null && !current }
}

/** Ask the browser to save the file under its own name. */
function saveFromUrl(url: string, name: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** Sign a 60-second download link and hand it to the browser. */
export function useDownloadFile() {
  return useMutation({
    mutationFn: async (file: HouseholdFile) => {
      saveFromUrl(await signOne(file.storage_path, DOWNLOAD_TTL_SECONDS, file.name), file.name)
    },
  })
}

// ---------------------------------------------------------------------------
// Changing a file
// ---------------------------------------------------------------------------

async function updateRow(id: string, patch: TablesUpdate<'files'>): Promise<HouseholdFile> {
  const row = unwrap(await supabase.from('files').update(patch).eq('id', id).select().maybeSingle())
  if (!row) throw new Error('That file no longer exists.')
  return row
}

/** Rename changes the row only. The stored object keeps its original key. */
export function useRenameFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateRow(id, { name: clampFileName(name) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.files }),
  })
}

/** Moving changes the row only. `folder` of "" means Unfiled. */
export function useMoveFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, folder }: { id: string; folder: string }) => updateRow(id, { folder }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.files }),
  })
}

/** Remove the stored object, then the row. A row whose object is already gone is still deleted. */
export function useDeleteFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: HouseholdFile) => {
      const { error } = await storage().remove([file.storage_path])
      if (error && !isMissingObjectError(error)) throw error
      unwrap(await supabase.from('files').delete().eq('id', file.id))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.files }),
  })
}

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------

/** Store one file, then add its row. If the row fails, take the object back out. */
async function uploadFile(file: File, folder: string): Promise<HouseholdFile> {
  const problem = validateUpload(file)
  if (problem) throw new Error(problem)

  const path = `${crypto.randomUUID()}/${safeStorageName(file.name)}`
  const { error: uploadError } = await storage().upload(path, file, {
    // Types that could run script (SVG, HTML) are stored as plain downloads.
    contentType: storageContentType(file.type),
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('files')
    .insert({
      storage_path: path,
      name: clampFileName(file.name),
      folder,
      size_bytes: file.size,
      mime_type: file.type || null,
    })
    .select()
    .single()
  if (error) {
    // Best effort: a leftover object is invisible to the app and harmless.
    await storage()
      .remove([path])
      .catch(() => undefined)
    throw error
  }
  return data
}

export type UploadItem = {
  id: string
  file: File
  folder: string
  status: UploadStatus
  error: string | null
}

const UPLOAD_CONCURRENCY = 3
const CLEAR_DONE_AFTER_MS = 4000

/**
 * Upload several files at once. Each file has its own status for the upload tray:
 * queued, uploading, done, or failed with a reason. Failed files can be retried.
 */
export function useUploads() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [items, setItems] = useState<UploadItem[]>([])

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((all) => all.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }, [])

  const run = useCallback(
    async (batch: UploadItem[]) => {
      let done = 0
      let failed = 0
      await runWithConcurrency(batch, UPLOAD_CONCURRENCY, async (item) => {
        patch(item.id, { status: 'uploading', error: null })
        try {
          await uploadFile(item.file, item.folder)
          done += 1
          patch(item.id, { status: 'done' })
          void queryClient.invalidateQueries({ queryKey: qk.files })
        } catch (err) {
          failed += 1
          patch(item.id, { status: 'failed', error: friendlyError(err) })
        }
      })
      const summary = summarizeUploads(done, failed)
      toast(summary.message, { tone: summary.tone })
    },
    [patch, queryClient, toast],
  )

  const start = useCallback(
    (files: File[], folder: string) => {
      if (files.length === 0) return
      const batch: UploadItem[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        folder,
        status: 'queued',
        error: null,
      }))
      setItems((all) => [...all, ...batch])
      void run(batch)
    },
    [run],
  )

  const retry = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id)
      if (!item || item.status !== 'failed') return
      patch(id, { status: 'queued', error: null })
      void run([item])
    },
    [items, patch, run],
  )

  const dismiss = useCallback((id: string) => setItems((all) => all.filter((i) => i.id !== id)), [])

  const clearFinished = useCallback(
    () => setItems((all) => all.filter((i) => i.status === 'queued' || i.status === 'uploading')),
    [],
  )

  const busy = items.some((i) => i.status === 'queued' || i.status === 'uploading')

  // Warn before the tab closes mid-upload.
  useEffect(() => {
    if (!busy) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  // When everything went through, tidy the tray away after a moment.
  const allDone = items.length > 0 && items.every((i) => i.status === 'done')
  useEffect(() => {
    if (!allDone) return
    const timer = window.setTimeout(() => setItems([]), CLEAR_DONE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [allDone])

  return { items, busy, start, retry, dismiss, clearFinished }
}
