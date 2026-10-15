// Receipt files: validation and storage paths. Uploading lives in hooks.ts.

/** Same as the storage bucket's file_size_limit (50 MB). */
export const RECEIPT_MAX_BYTES = 50 * 1024 * 1024

/** Files section folder that receipts are filed under. */
export const RECEIPTS_FOLDER = 'Receipts'

/** For <input type="file" accept>. */
export const RECEIPT_ACCEPT = 'image/*,application/pdf,.pdf,.heic,.heif'

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
}

type FileLike = { name: string; size: number; type: string }

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** The file's MIME type, guessed from its extension when the browser leaves it blank. Null if not a receipt type. */
export function receiptMimeType(file: Pick<FileLike, 'name' | 'type'>): string | null {
  const type = file.type.toLowerCase()
  // SVG can carry script, so it isn't accepted as a receipt.
  if (type === 'image/svg+xml') return null
  if (type === 'application/pdf' || type.startsWith('image/')) return type
  if (type && type !== 'application/octet-stream') return null
  return EXTENSION_TYPES[extensionOf(file.name)] ?? null
}

/** Why this file can't be a receipt, or null when it can. */
export function validateReceipt(file: FileLike): string | null {
  if (!receiptMimeType(file)) return 'Choose a photo or a PDF.'
  if (file.size <= 0) return 'That file is empty.'
  if (file.size > RECEIPT_MAX_BYTES) return 'That file is over the 50 MB limit.'
  return null
}

/**
 * A file name that is safe as a storage key: ASCII letters, digits, dot, dash
 * and underscore; accents dropped; at most 100 characters with the extension kept.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
  if (!cleaned) return 'receipt'
  if (cleaned.length <= 100) return cleaned
  const ext = extensionOf(cleaned)
  const keep = ext && ext.length <= 10 ? `.${ext}` : ''
  return `${cleaned.slice(0, 100 - keep.length).replace(/[-.]+$/, '')}${keep}`
}

/** Storage path for a new receipt: receipts/<uuid>/<safe name>. */
export function receiptStoragePath(id: string, fileName: string): string {
  return `receipts/${id}/${safeFileName(fileName)}`
}

/** Name to show in the Files section (files.name allows 1-255 characters). */
export function receiptDisplayName(fileName: string): string {
  const trimmed = fileName.trim().slice(0, 255)
  return trimmed || 'Receipt'
}

/** "receipts/<uuid>/water-bill.pdf" -> "water-bill.pdf". */
export function receiptNameFromPath(path: string): string {
  return path.split('/').pop() || 'Receipt'
}

/** "2.4 MB", "830 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** True when Storage says the object doesn't exist (deleted from Files, say). */
export function isMissingFileError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { message?: unknown; statusCode?: unknown; status?: unknown; code?: unknown }
  if (e.code === 'NoSuchKey' || e.statusCode === '404' || e.status === 404) return true
  return typeof e.message === 'string' && /not\s*found|does not exist|NoSuchKey/i.test(e.message)
}

export const MISSING_RECEIPT_MESSAGE = 'That receipt file is missing. It may have been deleted from Files.'
