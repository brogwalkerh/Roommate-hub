// Pure helpers for the Files feature: no React, no Supabase. Tested in fileUtils.test.ts.

import { differenceInSeconds, formatDistanceStrict } from 'date-fns'

/** The `household` bucket rejects anything bigger (see the storage bucket's file_size_limit). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024

/** Images above this size show the kind icon instead of a thumbnail: thumbnails load the full file. */
export const THUMBNAIL_MAX_BYTES = 8 * 1024 * 1024

/** `files.name` allows 1 to 255 characters. */
export const MAX_NAME_LENGTH = 255

/** `files.folder` allows up to 120 characters. */
export const MAX_FOLDER_LENGTH = 120

const MAX_STORAGE_NAME_LENGTH = 100

export const UNFILED_LABEL = 'Unfiled'

// ---------------------------------------------------------------------------
// Sizes and dates
// ---------------------------------------------------------------------------

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** "0 B", "850 B", "12 KB", "3.4 MB". 1 KB is 1024 bytes. One decimal under 10, none above. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) return '0 B'
  if (bytes < 1024) return `${Math.floor(bytes)} B`

  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  let rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value)
  // 1023.8 KB rounds to 1024: show it as 1 MB instead.
  while (rounded >= 1024 && unit < UNITS.length - 1) {
    rounded = Math.round((rounded / 1024) * 10) / 10
    unit += 1
  }
  return `${rounded} ${UNITS[unit]}`
}

/** "Just now", "5 minutes ago", "2 days ago". Pass `now` in tests. */
export function formatUploaded(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  if (differenceInSeconds(now, date) < 60) return 'Just now'
  return formatDistanceStrict(date, now, { addSuffix: true })
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * A storage-safe version of a file name. Keeps the extension, turns anything outside
 * [A-Za-z0-9._-] into "-", collapses repeats, trims to 100 characters, never returns "".
 * The readable original name lives in `files.name`; this only builds the object key.
 */
export function safeStorageName(name: string): string {
  const trimmed = name.trim()
  const match = /^([\s\S]*)\.([A-Za-z0-9]{1,19})$/.exec(trimmed)
  const rawBase = match ? match[1] : trimmed
  const extension = match ? `.${match[2]}` : ''

  const cleanBase = (value: string) =>
    value
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/\.{2,}/g, '.')
      .replace(/^[-.]+|[-.]+$/g, '')

  const room = Math.max(1, MAX_STORAGE_NAME_LENGTH - extension.length)
  const base = cleanBase(cleanBase(rawBase).slice(0, room)) || 'file'
  return `${base}${extension}`
}

/** The name stored in `files.name`: trimmed, never empty, at most 255 characters (extension kept). */
export function clampFileName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'Untitled'
  if (trimmed.length <= MAX_NAME_LENGTH) return trimmed
  const match = /\.([A-Za-z0-9]{1,19})$/.exec(trimmed)
  const extension = match ? match[0] : ''
  return trimmed.slice(0, MAX_NAME_LENGTH - extension.length) + extension
}

/** Error text for a rename field, or null when the name is fine. */
export function validateFileName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a file name.'
  if (trimmed.length > MAX_NAME_LENGTH) return `Use ${MAX_NAME_LENGTH} characters or fewer.`
  return null
}

/** Lowercase extension without the dot ("pdf"), or "". */
export function extensionOf(name: string): string {
  const match = /\.([A-Za-z0-9]{1,19})$/.exec(name.trim())
  return match ? match[1].toLowerCase() : ''
}

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export type FileKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'archive' | 'audio' | 'video' | 'other'

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  heif: 'image',
  avif: 'image',
  bmp: 'image',
  svg: 'image',
  tif: 'image',
  tiff: 'image',
  pdf: 'pdf',
  doc: 'doc',
  docx: 'doc',
  odt: 'doc',
  rtf: 'doc',
  txt: 'doc',
  md: 'doc',
  pages: 'doc',
  ppt: 'doc',
  pptx: 'doc',
  odp: 'doc',
  key: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  ods: 'sheet',
  csv: 'sheet',
  tsv: 'sheet',
  numbers: 'sheet',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  bz2: 'archive',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  aac: 'audio',
  ogg: 'audio',
  flac: 'audio',
  mp4: 'video',
  mov: 'video',
  m4v: 'video',
  webm: 'video',
  avi: 'video',
  mkv: 'video',
}

function kindFromMime(mime: string): FileKind | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'text/csv' || mime === 'text/tab-separated-values' || /spreadsheet|ms-excel|numbers/.test(mime)) {
    return 'sheet'
  }
  if (mime.startsWith('text/') || /wordprocessing|msword|opendocument\.(text|presentation)|presentation|powerpoint|rtf|apple\.(pages|keynote)/.test(mime)) {
    return 'doc'
  }
  if (/zip|x-7z|rar|gzip|x-tar|bzip2|compressed/.test(mime)) return 'archive'
  return null
}

/** Which icon family a file gets. Trusts the MIME type first, then the extension. */
export function fileKind(mime: string | null | undefined, name: string): FileKind {
  const cleanMime = (mime ?? '').split(';')[0].trim().toLowerCase()
  return kindFromMime(cleanMime) ?? KIND_BY_EXTENSION[extensionOf(name)] ?? 'other'
}

type KindSource = { mime_type: string | null; name: string; size_bytes: number }

/** Images small enough to use as their own thumbnail. */
export function canThumbnail(file: KindSource): boolean {
  return fileKind(file.mime_type, file.name) === 'image' && file.size_bytes <= THUMBNAIL_MAX_BYTES
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export type FolderInfo = { value: string; label: string; count: number }

export function folderLabel(folder: string): string {
  return folder === '' ? UNFILED_LABEL : folder
}

/**
 * Distinct folders with file counts, A to Z, with Unfiled ("") last.
 * A folder only exists while a file is in it.
 */
export function folderList(files: readonly { folder: string }[]): FolderInfo[] {
  const counts = new Map<string, number>()
  for (const file of files) counts.set(file.folder, (counts.get(file.folder) ?? 0) + 1)

  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: folderLabel(value), count }))
    .sort((a, b) => {
      if (a.value === '') return 1
      if (b.value === '') return -1
      return a.label.localeCompare(b.label, 'en', { sensitivity: 'base', numeric: true }) || a.label.localeCompare(b.label, 'en')
    })
}

export type FolderResult = { ok: true; folder: string } | { ok: false; error: string }

/**
 * Clean up a typed folder name. Matches existing folders ignoring case so "lease" joins "Lease",
 * and "Unfiled" means no folder.
 */
export function resolveFolder(input: string, existing: readonly string[]): FolderResult {
  const name = input.trim().replace(/\s+/g, ' ')
  if (!name) return { ok: false, error: 'Enter a folder name.' }
  if (name.toLowerCase() === UNFILED_LABEL.toLowerCase()) return { ok: true, folder: '' }
  if (name.length > MAX_FOLDER_LENGTH) return { ok: false, error: `Use ${MAX_FOLDER_LENGTH} characters or fewer.` }
  const match = existing.find((folder) => folder.toLowerCase() === name.toLowerCase())
  return { ok: true, folder: match ?? name }
}

/** What a folder <select> holds: an existing folder, or "New folder" plus a typed name. */
export type FolderPick = { select: string; newName: string }

export const NEW_FOLDER_VALUE = 'new'

export function pickFolder(folder: string): FolderPick {
  return { select: `f:${folder}`, newName: '' }
}

export function pickNewFolder(): FolderPick {
  return { select: NEW_FOLDER_VALUE, newName: '' }
}

export function resolvePick(pick: FolderPick, existing: readonly string[]): FolderResult {
  if (pick.select === NEW_FOLDER_VALUE) return resolveFolder(pick.newName, existing)
  if (pick.select.startsWith('f:')) return { ok: true, folder: pick.select.slice(2) }
  return { ok: false, error: 'Choose a folder.' }
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

/** Why a file can't be uploaded, or null when it can. */
export function validateUpload(file: { size: number }): string | null {
  if (file.size <= 0) return 'This file is empty.'
  if (file.size > MAX_FILE_BYTES) {
    return `This file is ${formatBytes(file.size)}, over the ${formatBytes(MAX_FILE_BYTES)} limit.`
  }
  return null
}

/** Storage paths the Bills module uses for receipts. */
export function isReceiptPath(storagePath: string): boolean {
  return storagePath.startsWith('receipts/')
}

/** True for a storage "object not found" error, so deleting a file whose object is gone still works. */
export function isMissingObjectError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { statusCode?: unknown; status?: unknown; message?: unknown }
  if (String(e.statusCode) === '404' || String(e.status) === '404') return true
  return typeof e.message === 'string' && /not found|does not exist|no such object/i.test(e.message)
}
