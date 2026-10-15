import { Button } from './Button'
import { Spinner } from './Spinner'
import { friendlyError } from '../../lib/errors'

/** Centered spinner for a section that is still loading. */
export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted">
      <Spinner />
      <span>{label}…</span>
    </div>
  )
}

/** Inline error with an optional retry. */
export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-danger">
      <p>{friendlyError(error)}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
