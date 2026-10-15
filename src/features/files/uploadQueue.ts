// Pure helpers for the upload queue. The React side lives in hooks.ts.

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed'

/**
 * Run `worker` for every item with at most `limit` running at once, starting items in order.
 * The worker should catch its own errors: one that throws stops its lane and rejects the result.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const lanes = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (next < items.length) {
        const index = next++
        await worker(items[index], index)
      }
    }),
  )
}

const plural = (n: number) => (n === 1 ? '1 file' : `${n} files`)

/** The toast shown when a batch finishes. */
export function summarizeUploads(done: number, failed: number): { message: string; tone: 'default' | 'error' } {
  if (failed === 0) return { message: `Uploaded ${plural(done)}.`, tone: 'default' }
  if (done === 0) return { message: `${plural(failed)} didn’t upload.`, tone: 'error' }
  return { message: `Uploaded ${plural(done)}. ${plural(failed)} didn’t upload.`, tone: 'error' }
}
