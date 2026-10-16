// Content types the storage bucket accepts (see the bucket's allowed_mime_types
// in supabase/migrations). Anything else, notably SVG, HTML and XML, which can
// run script when opened, is stored as a plain download.

const SAFE = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/bmp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf',
  'application/zip',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/quicktime',
  'video/webm',
])

export const DOWNLOAD_ONLY_TYPE = 'application/octet-stream'

/** The Content-Type to store a file with. */
export function storageContentType(type: string | null | undefined): string {
  const t = (type ?? '').toLowerCase().split(';')[0].trim()
  return SAFE.has(t) ? t : DOWNLOAD_ONLY_TYPE
}

/**
 * The file's bytes as a Blob typed with storageContentType(type), ready to upload.
 * supabase-js sends a Blob as form data with the Blob's own type and ignores the
 * contentType option, so the type has to travel on the Blob itself.
 */
export function storageBody(file: Blob, type: string | null | undefined = file.type): Blob {
  return file.slice(0, file.size, storageContentType(type))
}
