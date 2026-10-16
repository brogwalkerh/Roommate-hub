import { storageBody, storageContentType } from './contentTypes'

describe('storageBody', () => {
  it('retypes script-capable files as plain downloads', async () => {
    const file = new File(['<script>alert(1)</script>'], 'page.html', { type: 'text/html' })
    const body = storageBody(file)
    expect(body.type).toBe('application/octet-stream')
    expect(await body.text()).toBe('<script>alert(1)</script>')
  })

  it('keeps safe types', () => {
    expect(storageBody(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })).type).toBe('application/pdf')
  })

  it('uses a type worked out elsewhere when the browser gave none', () => {
    const heic = new File(['x'], 'IMG_1.HEIC', { type: '' })
    expect(storageBody(heic, 'image/heic').type).toBe('image/heic')
    expect(storageBody(heic).type).toBe('application/octet-stream')
  })
})

describe('storageContentType', () => {
  it.each(['image/jpeg', 'application/pdf', 'IMAGE/PNG', 'text/plain; charset=utf-8'])('keeps %s', (type) => {
    expect(storageContentType(type)).toBe(type.toLowerCase().split(';')[0])
  })

  it.each(['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/xml', 'application/javascript', '', null])(
    'stores %s as a plain download',
    (type) => {
      expect(storageContentType(type)).toBe('application/octet-stream')
    },
  )
})
