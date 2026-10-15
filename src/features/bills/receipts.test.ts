import { describeBillError } from './billErrors'
import { categoryFor } from './categories'
import {
  RECEIPT_MAX_BYTES,
  formatBytes,
  isMissingFileError,
  receiptDisplayName,
  receiptMimeType,
  receiptNameFromPath,
  receiptStoragePath,
  safeFileName,
  validateReceipt,
} from './receipts'

describe('receiptMimeType', () => {
  it('trusts image and PDF types', () => {
    expect(receiptMimeType({ name: 'a.jpg', type: 'image/jpeg' })).toBe('image/jpeg')
    expect(receiptMimeType({ name: 'a', type: 'application/pdf' })).toBe('application/pdf')
    expect(receiptMimeType({ name: 'a.heic', type: 'IMAGE/HEIC' })).toBe('image/heic')
  })

  it('guesses from the extension when the type is blank', () => {
    expect(receiptMimeType({ name: 'Bill.PDF', type: '' })).toBe('application/pdf')
    expect(receiptMimeType({ name: 'photo.heic', type: 'application/octet-stream' })).toBe('image/heic')
    expect(receiptMimeType({ name: 'notes.txt', type: '' })).toBeNull()
  })

  it('rejects other types', () => {
    expect(receiptMimeType({ name: 'a.pdf', type: 'text/plain' })).toBeNull()
    expect(receiptMimeType({ name: 'a.zip', type: 'application/zip' })).toBeNull()
  })
})

describe('validateReceipt', () => {
  it('accepts images and PDFs up to 50 MB', () => {
    expect(validateReceipt({ name: 'a.pdf', type: 'application/pdf', size: RECEIPT_MAX_BYTES })).toBeNull()
    expect(validateReceipt({ name: 'a.png', type: 'image/png', size: 1 })).toBeNull()
  })

  it('explains what is wrong', () => {
    expect(validateReceipt({ name: 'a.pdf', type: 'application/pdf', size: RECEIPT_MAX_BYTES + 1 })).toBe(
      'That file is over the 50 MB limit.',
    )
    expect(validateReceipt({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toBe('That file is empty.')
    expect(validateReceipt({ name: 'a.docx', type: 'application/msword', size: 10 })).toBe('Choose a photo or a PDF.')
  })
})

describe('safeFileName', () => {
  it.each([
    ['water bill.pdf', 'water-bill.pdf'],
    ['Café receipt (1).JPG', 'Cafe-receipt-1.JPG'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\scan.png', 'scan.png'],
    ['.hidden', 'hidden'],
    ['🧾.pdf', 'pdf'],
    ['', 'receipt'],
    ['???', 'receipt'],
    ['a--b__c.pdf', 'a-b__c.pdf'],
  ])('%j -> %j', (input, output) => {
    expect(safeFileName(input)).toBe(output)
  })

  it('only uses storage-safe characters', () => {
    for (const name of ['naïve résumé.pdf', 'Ünïcödé fïlé.png', 'a#b?c%d&e.pdf', 'tab\there.pdf']) {
      expect(safeFileName(name)).toMatch(/^[A-Za-z0-9._-]+$/)
    }
  })

  it('shortens long names and keeps the extension', () => {
    const long = `${'x'.repeat(300)}.pdf`
    const safe = safeFileName(long)
    expect(safe.length).toBeLessThanOrEqual(100)
    expect(safe.endsWith('.pdf')).toBe(true)
  })
})

describe('receipt paths and names', () => {
  it('builds receipts/<uuid>/<safe name>', () => {
    expect(receiptStoragePath('1234', 'Power bill.pdf')).toBe('receipts/1234/Power-bill.pdf')
  })

  it('reads the name back from a path', () => {
    expect(receiptNameFromPath('receipts/1234/Power-bill.pdf')).toBe('Power-bill.pdf')
    expect(receiptNameFromPath('')).toBe('Receipt')
  })

  it('keeps display names within 1-255 characters', () => {
    expect(receiptDisplayName('  Power bill.pdf ')).toBe('Power bill.pdf')
    expect(receiptDisplayName('   ')).toBe('Receipt')
    expect(receiptDisplayName('y'.repeat(400))).toHaveLength(255)
  })

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
})

describe('isMissingFileError', () => {
  it('recognizes Storage "not found" errors', () => {
    expect(isMissingFileError({ message: 'Object not found', statusCode: '404' })).toBe(true)
    expect(isMissingFileError({ message: 'x', code: 'NoSuchKey' })).toBe(true)
    expect(isMissingFileError({ message: 'x', status: 404 })).toBe(true)
    expect(isMissingFileError(new Error('The resource was not found'))).toBe(true)
  })

  it('ignores other errors', () => {
    expect(isMissingFileError({ message: 'Failed to fetch' })).toBe(false)
    expect(isMissingFileError({ message: 'new row violates row-level security policy', statusCode: '403' })).toBe(false)
    expect(isMissingFileError(null)).toBe(false)
    expect(isMissingFileError('not found')).toBe(false)
  })
})

describe('categoryFor', () => {
  it('maps stored values and falls back to Other', () => {
    expect(categoryFor('rent').label).toBe('Rent')
    expect(categoryFor('Utilities').label).toBe('Utilities')
    expect(categoryFor('pets').label).toBe('Other')
    expect(categoryFor(null).value).toBe('other')
  })
})

describe('describeBillError', () => {
  it('explains bill errors in plain words', () => {
    expect(describeBillError({ message: 'bill_not_found' })).toBe('This bill no longer exists. Your roommate may have deleted it.')
    expect(describeBillError({ message: 'new row for relation "bills" violates check constraint "bills_paid_shape"' })).toBe(
      'Pick who paid and the date they paid.',
    )
    expect(describeBillError({ message: 'shares_mismatch: shares add up to 1 but the bill is 2' })).toBe(
      'The split doesn’t add up to the bill total.',
    )
    expect(describeBillError(new Error('Failed to fetch'))).toBe('Can’t reach the server. Check your connection and try again.')
  })
})
