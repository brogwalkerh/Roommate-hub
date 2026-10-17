import * as XLSX from 'xlsx'
import { fitWithin, readScheduleFile, scheduleFileKind, workbookToText } from './readScheduleFile'

const file = (parts: BlobPart[], name: string, type = '') => new File(parts, name, { type })

describe('scheduleFileKind', () => {
  it.each([
    ['rota.pdf', 'application/pdf', 'pdf'],
    ['ROTA.PDF', '', 'pdf'],
    ['photo.jpg', 'image/jpeg', 'image'],
    ['IMG_1.HEIC', 'image/heic', 'image'],
    ['week.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'sheet'],
    ['old.xls', '', 'sheet'],
    ['shifts.ods', '', 'sheet'],
    ['shifts.csv', 'text/csv', 'text'],
    ['notes.txt', 'text/plain', 'text'],
  ])('%s -> %s', (name, type, kind) => {
    expect(scheduleFileKind({ name, type })).toBe(kind)
  })

  it('refuses SVG and unknown files', () => {
    expect(scheduleFileKind({ name: 'logo.svg', type: 'image/svg+xml' })).toBeNull()
    expect(scheduleFileKind({ name: 'archive.zip', type: 'application/zip' })).toBeNull()
  })
})

describe('fitWithin', () => {
  it('shrinks the long side and keeps small images as they are', () => {
    expect(fitWithin(6000, 4000, 3000)).toEqual({ width: 3000, height: 2000 })
    expect(fitWithin(1170, 9000, 3000)).toEqual({ width: 390, height: 3000 })
    expect(fitWithin(800, 600, 3000)).toEqual({ width: 800, height: 600 })
  })
})

describe('readScheduleFile', () => {
  it('sends a PDF as base64', async () => {
    const out = await readScheduleFile(file(['%PDF-1.4'], 'rota.pdf', 'application/pdf'))
    expect(out).toEqual({ type: 'pdf', media_type: 'application/pdf', data: btoa('%PDF-1.4') })
  })

  it('sends a small PNG as it is', async () => {
    const out = await readScheduleFile(file(['png-bytes'], 'week.png', 'image/png'))
    expect(out).toEqual({ type: 'image', media_type: 'image/png', data: btoa('png-bytes') })
  })

  it('sends CSV as text', async () => {
    const out = await readScheduleFile(file(['Day,Start,End\nMon,9:00,17:00\n'], 'week.csv', 'text/csv'))
    expect(out).toEqual({ type: 'text', data: 'Day,Start,End\nMon,9:00,17:00' })
  })

  it('turns a workbook into labelled CSV', async () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Day', 'Shift'], ['Mon', '9-5'], ['Tue', 'Off']]), 'Week 1')
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[]]), 'Empty')
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    expect(await workbookToText(bytes)).toBe('## Sheet: Week 1\nDay,Shift\nMon,9-5\nTue,Off')
    const out = await readScheduleFile(file([bytes], 'rota.xlsx'))
    expect(out).toEqual({ type: 'text', data: '## Sheet: Week 1\nDay,Shift\nMon,9-5\nTue,Off' })
  })

  it.each([
    [file(['x'], 'archive.zip', 'application/zip'), 'unsupported_file'],
    [file(['   '], 'blank.csv', 'text/csv'), 'empty_file'],
    [file(['a'.repeat(200_001)], 'big.txt', 'text/plain'), 'file_too_large'],
  ])('rejects %#', async (f, code) => {
    await expect(readScheduleFile(f)).rejects.toThrow(code)
  })

  it('rejects a PDF over 10 MB', async () => {
    const big = file([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.pdf', 'application/pdf')
    await expect(readScheduleFile(big)).rejects.toThrow('file_too_large')
  })
})
