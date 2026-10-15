import { CloudUpload, FolderOpen, FolderPlus, Upload } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { EmptyState, PageHeader } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { friendlyError } from '../../lib/errors'
import { folderList, MAX_FILE_BYTES, formatBytes, pickFolder, pickNewFolder, type FolderPick } from './fileUtils'
import { FileCard, type FileCardActions } from './FileCard'
import { DeleteDialog, MoveDialog, RenameDialog } from './FileDialogs'
import { HiddenFileInput } from './HiddenFileInput'
import {
  useDownloadFile,
  useFiles,
  useThumbnailUrls,
  useUploads,
  type HouseholdFile,
} from './hooks'
import { PreviewDialog } from './PreviewDialog'
import { UploadDialog, type StagedFile } from './UploadDialog'
import { UploadTray } from './UploadTray'
import { useFileDrop } from './useFileDrop'

const NO_FILES: HouseholdFile[] = []

type Staging = { initialPick: FolderPick; files: StagedFile[] }
type Action = { kind: 'preview' | 'rename' | 'move' | 'delete'; id: string }

function FolderChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-10 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink hover:bg-surface-2'}`}
    >
      {children}
    </button>
  )
}

export default function FilesPage() {
  const files = useFiles()
  const { byId } = useMembers()
  const uploads = useUploads()
  const download = useDownloadFile()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  // null shows every file; "" is Unfiled.
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [staging, setStaging] = useState<Staging | null>(null)
  const [action, setAction] = useState<Action | null>(null)

  const all = files.data ?? NO_FILES
  const folders = useMemo(() => folderList(all), [all])
  const folderValues = useMemo(() => folders.map((f) => f.value), [folders])

  // A folder disappears when its last file leaves. Fall back to All instead of an empty view.
  if (folderFilter !== null && files.data && !folders.some((f) => f.value === folderFilter)) {
    setFolderFilter(null)
  }

  const visible = useMemo(
    () => (folderFilter === null ? all : all.filter((f) => f.folder === folderFilter)),
    [all, folderFilter],
  )
  const thumbnails = useThumbnailUrls(visible)

  // ---- Adding files -------------------------------------------------------

  const addFiles = (picked: File[]) => {
    if (picked.length === 0) return
    const added = picked.map((file) => ({ key: crypto.randomUUID(), file }))
    setStaging((current) => ({
      initialPick: current?.initialPick ?? pickFolder(folderFilter ?? ''),
      files: [...(current?.files ?? []), ...added],
    }))
  }

  const dragging = useFileDrop((dropped, skippedFolders) => {
    if (skippedFolders > 0) toast('Folders can’t be uploaded. Drop the files inside them instead.')
    addFiles(dropped)
  }, action === null)

  const openPicker = () => inputRef.current?.click()
  const startNewFolder = () => setStaging({ initialPick: pickNewFolder(), files: [] })

  // ---- Acting on one file -------------------------------------------------

  const target = action ? (all.find((f) => f.id === action.id) ?? null) : null
  const closeAction = () => {
    download.reset()
    setAction(null)
  }

  const downloadFile = (file: HouseholdFile) => {
    download.mutate(file, {
      // A toast would sit behind the preview dialog, which shows the error itself.
      onError: (error) => {
        if (action?.kind !== 'preview') toast(friendlyError(error), { tone: 'error' })
      },
    })
  }

  const cardActions: FileCardActions = {
    onOpen: (file) => setAction({ kind: 'preview', id: file.id }),
    onDownload: downloadFile,
    onRename: (file) => setAction({ kind: 'rename', id: file.id }),
    onMove: (file) => setAction({ kind: 'move', id: file.id }),
    onDelete: (file) => setAction({ kind: 'delete', id: file.id }),
  }

  // ---- Page ---------------------------------------------------------------

  let content: ReactNode
  if (files.isPending) {
    content = <LoadingBlock label="Loading files" />
  } else if (files.isError && !files.data) {
    content = <ErrorBlock error={files.error} onRetry={() => void files.refetch()} />
  } else if (all.length === 0) {
    content = (
      <EmptyState
        icon={<FolderOpen aria-hidden />}
        title="No files yet"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon={<Upload aria-hidden className="size-4" />} onClick={openPicker}>
              Upload files
            </Button>
            <Button icon={<FolderPlus aria-hidden className="size-4" />} onClick={startNewFolder}>
              New folder
            </Button>
          </div>
        }
      >
        Keep what you both need in one place: the lease, the Wi-Fi card, appliance manuals.
      </EmptyState>
    )
  } else {
    content = (
      <>
        <div role="group" aria-label="Folders" className="flex flex-wrap gap-2">
          <FolderChip active={folderFilter === null} onClick={() => setFolderFilter(null)}>
            All <span className="tabular opacity-70">{all.length}</span>
          </FolderChip>
          {folders.map((folder) => (
            <FolderChip
              key={folder.value}
              active={folderFilter === folder.value}
              onClick={() => setFolderFilter(folder.value)}
            >
              <span className="truncate">{folder.label}</span>{' '}
              <span className="tabular opacity-70">{folder.count}</span>
            </FolderChip>
          ))}
          <button
            type="button"
            onClick={startNewFolder}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-line px-3.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <FolderPlus aria-hidden className="size-4" />
            New folder
          </button>
        </div>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              uploader={byId(file.uploaded_by)}
              thumbnailUrl={thumbnails[file.storage_path]}
              showFolder={folderFilter === null}
              actions={cardActions}
            />
          ))}
        </ul>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Files"
        subtitle="Up to 50 MB per file. Only the two of you can see these."
        actions={
          <Button variant="primary" icon={<Upload aria-hidden className="size-4" />} onClick={openPicker}>
            Upload
          </Button>
        }
      />
      <HiddenFileInput inputRef={inputRef} onFiles={addFiles} />

      <UploadTray
        items={uploads.items}
        onRetry={uploads.retry}
        onDismiss={uploads.dismiss}
        onClearFinished={uploads.clearFinished}
      />

      {content}

      <UploadDialog
        open={staging !== null}
        staged={staging?.files ?? []}
        folders={folderValues}
        initialPick={staging?.initialPick ?? pickFolder('')}
        onClose={() => setStaging(null)}
        onAddFiles={addFiles}
        onRemove={(key) =>
          setStaging((current) => current && { ...current, files: current.files.filter((f) => f.key !== key) })
        }
        onUpload={(picked, folder) => {
          uploads.start(picked, folder)
          setStaging(null)
        }}
      />
      <PreviewDialog
        file={action?.kind === 'preview' ? target : null}
        downloading={download.isPending}
        downloadError={download.error}
        onDownload={downloadFile}
        onClose={closeAction}
      />
      <RenameDialog file={action?.kind === 'rename' ? target : null} onClose={closeAction} />
      <MoveDialog file={action?.kind === 'move' ? target : null} folders={folderValues} onClose={closeAction} />
      <DeleteDialog file={action?.kind === 'delete' ? target : null} onClose={closeAction} />

      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-6 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-accent bg-accent-soft px-10 py-12 text-center">
            <CloudUpload className="size-10 text-accent" />
            <p className="text-lg font-semibold">Drop files to upload</p>
            <p className="text-muted">Up to {formatBytes(MAX_FILE_BYTES)} each</p>
          </div>
        </div>
      )}
    </div>
  )
}
