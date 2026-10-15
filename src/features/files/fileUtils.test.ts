import {
  canThumbnail,
  clampFileName,
  extensionOf,
  fileKind,
  folderLabel,
  folderList,
  formatBytes,
  formatUploaded,
  isMissingObjectError,
  isReceiptPath,
  MAX_FILE_BYTES,
  NEW_FOLDER_VALUE,
  pickFolder,
  pickNewFolder,
  resolveFolder,
  resolvePick,
  safeStorageName,
  THUMBNAIL_MAX_BYTES,
  validateFileName,
  validateUpload,
} from './fileUtils'

const KB = 1024
const MB = 1024 * KB

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1, '1 B'],
    [850, '850 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [12 * KB, '12 KB'],
    [Math.round(3.4 * MB), '3.4 MB'],
    [10.4 * MB, '10 MB'],
    [50 * MB, '50 MB'],
    [5 * 1024 * MB, '5 GB'],
  ])('formats %d bytes as %j', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text)
  })

  it('carries into the next unit instead of showing 1024', () => {
    expect(formatBytes(1023.8 * KB)).toBe('1 MB')
    expect(formatBytes(1023.8 * MB)).toBe('1 GB')
  })

  it.each([-5, Number.NaN, Number.POSITIVE_INFINITY, 0.4])('shows 0 B for %d', (bytes) => {
    expect(formatBytes(bytes)).toBe('0 B')
  })
})

describe('safeStorageName', () => {
  it.each([
    ['lease.pdf', 'lease.pdf'],
    ['Wi-Fi card.PNG', 'Wi-Fi-card.PNG'],
    ['My Report (final).pdf', 'My-Report-final.pdf'],
    ['IMG_0042.JPG', 'IMG_0042.JPG'],
    ['archive.tar.gz', 'archive.tar.gz'],
    ['a   b___c.txt', 'a-b___c.txt'],
    ['a---b.txt', 'a-b.txt'],
    ['a...b.txt', 'a.b.txt'],
    ['  spaced out .txt', 'spaced-out.txt'],
    ['résumé.pdf', 'r-sum.pdf'],
    ['写真.jpg', 'file.jpg'],
    ['.pdf', 'file.pdf'],
    ['report.', 'report'],
    ['noextension', 'noextension'],
    ['../../etc/passwd', 'etc-passwd'],
    ['x.tar gz', 'x.tar-gz'],
  ])('turns %j into %j', (input, expected) => {
    expect(safeStorageName(input)).toBe(expected)
  })

  it.each(['', '   ', '...', '---', '写真', '\u{1F4C4}'])('never returns an empty name for %j', (input) => {
    const result = safeStorageName(input)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toMatch(/^[A-Za-z0-9._-]+$/)
  })

  it('only uses safe characters', () => {
    expect(safeStorageName('we!rd#na$me%^&*()+=[]{};:\'",<>?|\\`~ file.txt')).toMatch(/^[A-Za-z0-9._-]+$/)
  })

  it('trims to 100 characters and keeps the extension', () => {
    const result = safeStorageName(`${'a'.repeat(300)}.pdf`)
    expect(result).toHaveLength(100)
    expect(result.endsWith('.pdf')).toBe(true)
  })

  it('does not end the base with a dash or dot after trimming', () => {
    const result = safeStorageName(`${'a'.repeat(95)} ${'b'.repeat(20)}.pdf`)
    expect(result.length).toBeLessThanOrEqual(100)
    expect(result).not.toMatch(/[-.]\.pdf$/)
  })
})

describe('clampFileName', () => {
  it('keeps normal names and trims spaces', () => {
    expect(clampFileName('  Lease 2026.pdf ')).toBe('Lease 2026.pdf')
  })

  it('never returns an empty name', () => {
    expect(clampFileName('   ')).toBe('Untitled')
  })

  it('trims to 255 characters and keeps the extension', () => {
    const result = clampFileName(`${'n'.repeat(400)}.jpeg`)
    expect(result).toHaveLength(255)
    expect(result.endsWith('.jpeg')).toBe(true)
  })
})

describe('validateFileName', () => {
  it('accepts a normal name', () => {
    expect(validateFileName('Lease.pdf')).toBeNull()
  })
  it('rejects blank and very long names', () => {
    expect(validateFileName('   ')).toMatch(/enter a file name/i)
    expect(validateFileName('x'.repeat(256))).toMatch(/255/)
  })
})

describe('extensionOf', () => {
  it('lowercases and ignores non-extensions', () => {
    expect(extensionOf('Photo.JPG')).toBe('jpg')
    expect(extensionOf('noext')).toBe('')
    expect(extensionOf('trailing.')).toBe('')
    expect(extensionOf('a.b c')).toBe('')
  })
})

describe('fileKind', () => {
  it.each([
    ['image/jpeg', 'x.jpg', 'image'],
    ['image/heic', 'IMG_1.HEIC', 'image'],
    ['application/pdf', 'lease.pdf', 'pdf'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx', 'doc'],
    ['application/msword', 'a.doc', 'doc'],
    ['text/plain', 'notes.txt', 'doc'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'a.pptx', 'doc'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx', 'sheet'],
    ['application/vnd.ms-excel', 'a.xls', 'sheet'],
    ['text/csv', 'a.csv', 'sheet'],
    ['application/zip', 'a.zip', 'archive'],
    ['application/x-zip-compressed', 'a.zip', 'archive'],
    ['application/gzip', 'a.gz', 'archive'],
    ['audio/mpeg', 'a.mp3', 'audio'],
    ['video/mp4', 'a.mp4', 'video'],
    ['video/quicktime', 'a.mov', 'video'],
    ['application/octet-stream', 'a.bin', 'other'],
    ['application/json', 'a.json', 'other'],
  ] as const)('classifies %s (%s) as %s', (mime, name, kind) => {
    expect(fileKind(mime, name)).toBe(kind)
  })

  it('falls back to the extension when the MIME type is missing or generic', () => {
    expect(fileKind(null, 'scan.pdf')).toBe('pdf')
    expect(fileKind('', 'photo.PNG')).toBe('image')
    expect(fileKind('application/octet-stream', 'budget.xlsx')).toBe('sheet')
    expect(fileKind(undefined, 'song.m4a')).toBe('audio')
    expect(fileKind(null, 'backup.7z')).toBe('archive')
  })

  it('ignores MIME parameters and case', () => {
    expect(fileKind('Text/Plain; charset=utf-8', 'a')).toBe('doc')
  })

  it('returns other for unknown files', () => {
    expect(fileKind(null, 'mystery')).toBe('other')
    expect(fileKind(null, 'thing.xyz')).toBe('other')
  })
})

describe('canThumbnail', () => {
  it('thumbnails small images only', () => {
    expect(canThumbnail({ mime_type: 'image/png', name: 'a.png', size_bytes: 200 * KB })).toBe(true)
    expect(canThumbnail({ mime_type: 'image/png', name: 'a.png', size_bytes: THUMBNAIL_MAX_BYTES + 1 })).toBe(false)
    expect(canThumbnail({ mime_type: 'application/pdf', name: 'a.pdf', size_bytes: 100 })).toBe(false)
    expect(canThumbnail({ mime_type: null, name: 'a.jpg', size_bytes: 100 })).toBe(true)
  })
})

describe('folderList', () => {
  it('returns distinct folders A to Z with Unfiled last', () => {
    const files = [
      { folder: '' },
      { folder: 'Receipts' },
      { folder: 'appliance manuals' },
      { folder: 'Lease' },
      { folder: 'Receipts' },
      { folder: '' },
      { folder: 'Receipts' },
    ]
    expect(folderList(files)).toEqual([
      { value: 'appliance manuals', label: 'appliance manuals', count: 1 },
      { value: 'Lease', label: 'Lease', count: 1 },
      { value: 'Receipts', label: 'Receipts', count: 3 },
      { value: '', label: 'Unfiled', count: 2 },
    ])
  })

  it('sorts numbers naturally', () => {
    expect(folderList([{ folder: 'Year 10' }, { folder: 'Year 2' }]).map((f) => f.value)).toEqual(['Year 2', 'Year 10'])
  })

  it('leaves out Unfiled when nothing is unfiled, and handles no files', () => {
    expect(folderList([{ folder: 'Lease' }]).map((f) => f.value)).toEqual(['Lease'])
    expect(folderList([])).toEqual([])
  })
})

describe('folderLabel', () => {
  it('calls the empty folder Unfiled', () => {
    expect(folderLabel('')).toBe('Unfiled')
    expect(folderLabel('Lease')).toBe('Lease')
  })
})

describe('resolveFolder', () => {
  it('tidies spaces', () => {
    expect(resolveFolder('  Wi-Fi   and   internet ', [])).toEqual({ ok: true, folder: 'Wi-Fi and internet' })
  })
  it('joins an existing folder ignoring case', () => {
    expect(resolveFolder('lease', ['Lease', 'Receipts'])).toEqual({ ok: true, folder: 'Lease' })
  })
  it('treats Unfiled as no folder', () => {
    expect(resolveFolder(' unfiled ', [])).toEqual({ ok: true, folder: '' })
  })
  it('rejects blank and long names', () => {
    expect(resolveFolder('   ', [])).toEqual({ ok: false, error: 'Enter a folder name.' })
    expect(resolveFolder('x'.repeat(121), [])).toMatchObject({ ok: false })
    expect(resolveFolder('x'.repeat(120), [])).toMatchObject({ ok: true })
  })
})

describe('resolvePick', () => {
  it('returns an existing folder, including Unfiled', () => {
    expect(resolvePick(pickFolder('Lease'), [])).toEqual({ ok: true, folder: 'Lease' })
    expect(resolvePick(pickFolder(''), [])).toEqual({ ok: true, folder: '' })
  })
  it('resolves a typed new folder', () => {
    expect(resolvePick({ select: NEW_FOLDER_VALUE, newName: 'manuals' }, ['Manuals'])).toEqual({
      ok: true,
      folder: 'Manuals',
    })
    expect(resolvePick(pickNewFolder(), [])).toMatchObject({ ok: false })
  })
  it('rejects an unknown select value', () => {
    expect(resolvePick({ select: 'bogus', newName: '' }, [])).toMatchObject({ ok: false })
  })
})

describe('validateUpload', () => {
  it('accepts normal files up to the limit', () => {
    expect(validateUpload({ size: 1 })).toBeNull()
    expect(validateUpload({ size: MAX_FILE_BYTES })).toBeNull()
  })
  it('rejects files over 50 MB with a clear message', () => {
    expect(validateUpload({ size: MAX_FILE_BYTES + 1 })).toBe('This file is 50 MB, over the 50 MB limit.')
    expect(validateUpload({ size: 72 * MB })).toBe('This file is 72 MB, over the 50 MB limit.')
  })
  it('rejects empty files', () => {
    expect(validateUpload({ size: 0 })).toMatch(/empty/i)
  })
})

describe('isReceiptPath', () => {
  it('spots Bills receipts', () => {
    expect(isReceiptPath('receipts/abc/photo.jpg')).toBe(true)
    expect(isReceiptPath('abc/receipts/photo.jpg')).toBe(false)
  })
})

describe('isMissingObjectError', () => {
  it('recognizes storage not-found errors', () => {
    expect(isMissingObjectError({ statusCode: '404', message: 'x' })).toBe(true)
    expect(isMissingObjectError({ status: 404 })).toBe(true)
    expect(isMissingObjectError(new Error('Object not found'))).toBe(true)
  })
  it('does not hide other errors', () => {
    expect(isMissingObjectError(new Error('new row violates row-level security policy'))).toBe(false)
    expect(isMissingObjectError({ statusCode: '500' })).toBe(false)
    expect(isMissingObjectError(null)).toBe(false)
    expect(isMissingObjectError('Not Found')).toBe(false)
  })
})

describe('formatUploaded', () => {
  const now = new Date('2026-10-15T12:00:00Z')
  it('says Just now for fresh uploads, including small clock skew', () => {
    expect(formatUploaded('2026-10-15T11:59:30Z', now)).toBe('Just now')
    expect(formatUploaded('2026-10-15T12:00:05Z', now)).toBe('Just now')
  })
  it('uses plain relative times', () => {
    expect(formatUploaded('2026-10-15T11:55:00Z', now)).toBe('5 minutes ago')
    expect(formatUploaded('2026-10-15T09:00:00Z', now)).toBe('3 hours ago')
    expect(formatUploaded('2026-10-13T12:00:00Z', now)).toBe('2 days ago')
  })
  it('returns nothing for a bad date', () => {
    expect(formatUploaded('nope', now)).toBe('')
  })
})
