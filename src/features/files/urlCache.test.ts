import { createSignedUrlCache } from './urlCache'

describe('createSignedUrlCache', () => {
  it('returns a saved URL while it has enough life left', () => {
    let now = 0
    const cache = createSignedUrlCache(() => now, 20 * 60_000)
    cache.set('a/b.png', 'https://example.test/a', 3600)
    expect(cache.get('a/b.png')).toBe('https://example.test/a')
    now = 39 * 60_000
    expect(cache.get('a/b.png')).toBe('https://example.test/a')
  })

  it('drops a URL that expires within the margin', () => {
    let now = 0
    const cache = createSignedUrlCache(() => now, 20 * 60_000)
    cache.set('a/b.png', 'https://example.test/a', 3600)
    now = 41 * 60_000
    expect(cache.get('a/b.png')).toBeUndefined()
  })

  it('returns undefined for unknown paths and after clear', () => {
    const cache = createSignedUrlCache()
    expect(cache.get('nope')).toBeUndefined()
    cache.set('x', 'u', 3600)
    cache.clear()
    expect(cache.get('x')).toBeUndefined()
  })
})
