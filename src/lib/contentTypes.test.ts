import { storageContentType } from './contentTypes'

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
