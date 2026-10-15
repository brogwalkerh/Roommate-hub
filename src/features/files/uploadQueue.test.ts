import { runWithConcurrency, summarizeUploads } from './uploadQueue'

describe('runWithConcurrency', () => {
  it('runs every item and never exceeds the limit', async () => {
    let running = 0
    let peak = 0
    const seen: number[] = []
    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      seen.push(item)
      running -= 1
    })
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(peak).toBe(3)
  })

  it('starts items in order', async () => {
    const started: number[] = []
    await runWithConcurrency(['a', 'b', 'c'], 1, async (_item, index) => {
      started.push(index)
    })
    expect(started).toEqual([0, 1, 2])
  })

  it('handles an empty list and odd limits', async () => {
    const worker = vi.fn(async () => {})
    await runWithConcurrency([], 3, worker)
    expect(worker).not.toHaveBeenCalled()
    await runWithConcurrency([1, 2], 0, worker)
    await runWithConcurrency([1, 2], Number.NaN, worker)
    expect(worker).toHaveBeenCalledTimes(4)
  })
})

describe('summarizeUploads', () => {
  it('reports success', () => {
    expect(summarizeUploads(1, 0)).toEqual({ message: 'Uploaded 1 file.', tone: 'default' })
    expect(summarizeUploads(3, 0)).toEqual({ message: 'Uploaded 3 files.', tone: 'default' })
  })
  it('reports failures as errors', () => {
    expect(summarizeUploads(0, 1)).toEqual({ message: '1 file didn’t upload.', tone: 'error' })
    expect(summarizeUploads(2, 2)).toEqual({ message: 'Uploaded 2 files. 2 files didn’t upload.', tone: 'error' })
  })
})
