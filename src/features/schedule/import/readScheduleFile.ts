/**
 * Turn a picked file into what the parse-schedule function accepts: PDFs and
 * images as base64, spreadsheets as CSV text (one block per sheet).
 * Errors are thrown as codes that friendlyError() turns into sentences.
 */

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export type ScheduleSource =
  | { type: 'pdf'; media_type: 'application/pdf'; data: string }
  | { type: 'image'; media_type: ImageType; data: string }
  | { type: 'text'; data: string }

export type ScheduleFileKind = 'pdf' | 'image' | 'sheet' | 'text'

export const MAX_PDF_BYTES = 10 * 1024 * 1024
export const MAX_SHEET_BYTES = 10 * 1024 * 1024
export const MAX_TEXT_CHARS = 200_000
/** Images up to this size go as they are; bigger ones are shrunk (the API takes 5 MB). */
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024
/** Longest side after shrinking: enough to read small print in a photographed rota. */
const MAX_IMAGE_SIDE = 3000

/** File types the picker offers. */
export const SCHEDULE_ACCEPT = '.pdf,image/*,.xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt'

const SHEET_EXT = /\.(xlsx|xlsm|xls|ods)$/i
const TEXT_EXT = /\.(csv|tsv|txt)$/i
const SENDABLE_IMAGES: ImageType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function scheduleFileKind(file: Pick<File, 'name' | 'type'>): ScheduleFileKind | null {
  const type = file.type.toLowerCase()
  if (type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  if (type.startsWith('image/') && type !== 'image/svg+xml') return 'image'
  if (SHEET_EXT.test(file.name) || type.includes('spreadsheet') || type === 'application/vnd.ms-excel') return 'sheet'
  if (TEXT_EXT.test(file.name) || type === 'text/csv' || type === 'text/plain') return 'text'
  return null
}

/** Base64 of a Blob, without the data: URL prefix. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
    reader.readAsDataURL(blob)
  })
}

/** Width and height that fit within maxSide, keeping the shape. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function shrinkImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // e.g. HEIC in a browser that can't decode it
    throw new Error('unsupported_image')
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('unsupported_image')
  ctx.fillStyle = '#ffffff' // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  for (const quality of [0.88, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= MAX_IMAGE_BYTES) return blob
  }
  throw new Error('file_too_large')
}

/** Every sheet of a workbook as CSV, labelled with its name. Blank sheets are left out. */
export async function workbookToText(data: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx')
  const book = XLSX.read(data, { type: 'array', cellDates: true })
  const parts: string[] = []
  for (const name of book.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(book.Sheets[name], { blankrows: false }).trim()
    if (csv.replace(/[,\s]/g, '') !== '') parts.push(`## Sheet: ${name}\n${csv}`)
  }
  return parts.join('\n\n')
}

export async function readScheduleFile(file: File): Promise<ScheduleSource> {
  const kind = scheduleFileKind(file)
  if (kind === 'pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('file_too_large')
    return { type: 'pdf', media_type: 'application/pdf', data: await blobToBase64(file) }
  }
  if (kind === 'image') {
    const type = file.type.toLowerCase() as ImageType
    if (SENDABLE_IMAGES.includes(type) && file.size <= MAX_IMAGE_BYTES) {
      return { type: 'image', media_type: type, data: await blobToBase64(file) }
    }
    return { type: 'image', media_type: 'image/jpeg', data: await blobToBase64(await shrinkImage(file)) }
  }
  if (kind === 'sheet' || kind === 'text') {
    if (file.size > MAX_SHEET_BYTES) throw new Error('file_too_large')
    const text = kind === 'sheet' ? await workbookToText(await file.arrayBuffer()) : (await file.text()).trim()
    if (text === '') throw new Error('empty_file')
    if (text.length > MAX_TEXT_CHARS) throw new Error('file_too_large')
    return { type: 'text', data: text }
  }
  throw new Error('unsupported_file')
}
