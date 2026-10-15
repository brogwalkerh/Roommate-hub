import { Check, CircleAlert, Clock, RotateCw, X } from 'lucide-react'
import { Button, IconButton } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Layout'
import { Spinner } from '../../components/ui/Spinner'
import { folderLabel, formatBytes } from './fileUtils'
import type { UploadItem } from './hooks'

function StatusIcon({ status }: { status: UploadItem['status'] }) {
  if (status === 'uploading') return <Spinner className="size-5 text-accent" />
  if (status === 'done') return <Check aria-hidden className="size-5 text-accent" />
  if (status === 'failed') return <CircleAlert aria-hidden className="size-5 text-danger" />
  return <Clock aria-hidden className="size-5 text-muted" />
}

function statusText(item: UploadItem): string {
  if (item.status === 'queued') return 'Waiting'
  if (item.status === 'uploading') return 'Uploading…'
  if (item.status === 'done') return `Added to ${folderLabel(item.folder)}`
  return item.error ?? 'Upload failed.'
}

/** Per-file progress for uploads that are running or just finished. Failed files can retry. */
export function UploadTray({
  items,
  onRetry,
  onDismiss,
  onClearFinished,
}: {
  items: UploadItem[]
  onRetry: (id: string) => void
  onDismiss: (id: string) => void
  onClearFinished: () => void
}) {
  if (items.length === 0) return null
  const active = items.filter((i) => i.status === 'queued' || i.status === 'uploading').length
  const failed = items.filter((i) => i.status === 'failed').length
  const heading =
    active > 0
      ? `Uploading ${active === 1 ? '1 file' : `${active} files`}`
      : failed > 0
        ? 'Some files didn’t upload'
        : 'Upload finished'

  return (
    <Panel>
      <div className="flex items-center justify-between gap-2 border-b border-line py-1 pr-2 pl-4">
        <h2 className="text-base font-semibold">{heading}</h2>
        {active < items.length && (
          <Button variant="ghost" aria-label="Clear finished uploads" onClick={onClearFinished}>
            Clear
          </Button>
        )}
      </div>
      <ul aria-live="polite" className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <StatusIcon status={item.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={item.file.name}>
                {item.file.name}
              </p>
              <p className={`text-sm ${item.status === 'failed' ? 'text-danger' : 'text-muted'}`}>
                {item.status === 'failed' ? statusText(item) : `${formatBytes(item.file.size)} · ${statusText(item)}`}
              </p>
            </div>
            {item.status === 'failed' && (
              <Button icon={<RotateCw aria-hidden className="size-4" />} onClick={() => onRetry(item.id)}>
                Retry
              </Button>
            )}
            {(item.status === 'done' || item.status === 'failed') && (
              <IconButton label={`Dismiss ${item.file.name}`} onClick={() => onDismiss(item.id)}>
                <X aria-hidden className="size-4" />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
