import { format } from 'date-fns'
import { Download, Eye, Folder, FolderInput, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PersonChip } from '../../components/Person'
import type { Profile } from '../../household/useHousehold'
import { ActionMenu } from './ActionMenu'
import { fileKind, folderLabel, formatBytes, formatUploaded } from './fileUtils'
import { FileIcon } from './FileIcon'
import type { HouseholdFile } from './hooks'

export type FileCardActions = {
  onOpen: (file: HouseholdFile) => void
  onDownload: (file: HouseholdFile) => void
  onRename: (file: HouseholdFile) => void
  onMove: (file: HouseholdFile) => void
  onDelete: (file: HouseholdFile) => void
}

/**
 * One file. Phones get a compact row (small thumbnail on the left); wider screens get a card with
 * a large thumbnail on top. Tapping the card opens the preview; the menu holds the other actions.
 */
export function FileCard({
  file,
  uploader,
  thumbnailUrl,
  showFolder,
  actions,
}: {
  file: HouseholdFile
  uploader: Profile | null
  thumbnailUrl?: string
  showFolder: boolean
  actions: FileCardActions
}) {
  const kind = fileKind(file.mime_type, file.name)
  // Some images can't be drawn by this browser (HEIC in Chrome): fall back to the icon.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const showThumbnail = !!thumbnailUrl && brokenUrl !== thumbnailUrl
  const created = new Date(file.created_at)

  return (
    <li className="relative flex rounded-2xl border border-line bg-surface transition-colors hover:border-accent/50">
      <button
        type="button"
        onClick={() => actions.onOpen(file)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 pr-12 text-left sm:flex-col sm:items-stretch sm:gap-0 sm:p-0 sm:pr-0"
      >
        <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-muted sm:aspect-4/3 sm:size-auto sm:w-full sm:rounded-b-none sm:rounded-t-2xl">
          {showThumbnail ? (
            <img
              src={thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setBrokenUrl(thumbnailUrl)}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <FileIcon kind={kind} className="size-7 sm:size-10" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:p-3 sm:pt-2.5">
          <span className="block truncate font-medium" title={file.name}>
            {file.name}
          </span>
          <span className="text-sm text-muted">
            {formatBytes(file.size_bytes)} ·{' '}
            <time dateTime={file.created_at} title={format(created, 'PPp')}>
              {formatUploaded(file.created_at)}
            </time>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
            {uploader ? <PersonChip person={uploader} /> : <span>Someone</span>}
            {showFolder && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Folder aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{folderLabel(file.folder)}</span>
              </span>
            )}
          </span>
        </span>
      </button>
      <ActionMenu
        label={`Actions for ${file.name}`}
        className="absolute top-1/2 right-1 -translate-y-1/2 sm:top-1 sm:translate-y-0 sm:[&>button]:bg-surface/90 sm:[&>button]:shadow-sm"
        items={[
          { label: 'Open', icon: <Eye />, onSelect: () => actions.onOpen(file) },
          { label: 'Download', icon: <Download />, onSelect: () => actions.onDownload(file) },
          { label: 'Rename', icon: <Pencil />, onSelect: () => actions.onRename(file) },
          { label: 'Move', icon: <FolderInput />, onSelect: () => actions.onMove(file) },
          { label: 'Delete', icon: <Trash2 />, onSelect: () => actions.onDelete(file), tone: 'danger' },
        ]}
      />
    </li>
  )
}
