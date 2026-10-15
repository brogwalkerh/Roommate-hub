import { Plus, Upload, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { fileKind, formatBytes, NEW_FOLDER_VALUE, resolvePick, validateUpload, type FolderPick } from './fileUtils'
import { FileIcon } from './FileIcon'
import { FolderPicker } from './FolderPicker'
import { HiddenFileInput } from './HiddenFileInput'

export type StagedFile = { key: string; file: File }

const FORM_ID = 'upload-form'

type UploadDialogProps = {
  open: boolean
  staged: StagedFile[]
  /** Existing folder values, for the folder list. */
  folders: readonly string[]
  initialPick: FolderPick
  onClose: () => void
  /** Called with more files picked inside the dialog. */
  onAddFiles: (files: File[]) => void
  onRemove: (key: string) => void
  /** Called with the files that passed the checks and the chosen folder ("" is Unfiled). */
  onUpload: (files: File[], folder: string) => void
}

/** Review the picked files, choose (or create) the folder, then start the upload. */
export function UploadDialog({ open, staged, folders, initialPick, onClose, onAddFiles, onRemove, onUpload }: UploadDialogProps) {
  const uploadable = staged.filter((s) => !validateUpload(s.file)).map((s) => s.file)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Upload files"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            disabled={uploadable.length === 0}
            icon={<Upload aria-hidden className="size-4" />}
          >
            {uploadable.length > 1 ? `Upload ${uploadable.length} files` : 'Upload'}
          </Button>
        </>
      }
    >
      <UploadForm
        staged={staged}
        folders={folders}
        initialPick={initialPick}
        onAddFiles={onAddFiles}
        onRemove={onRemove}
        onSubmit={(folder) => onUpload(uploadable, folder)}
      />
    </Dialog>
  )
}

// Mounted only while the dialog is open, so the folder choice starts fresh each time.
function UploadForm({
  staged,
  folders,
  initialPick,
  onAddFiles,
  onRemove,
  onSubmit,
}: {
  staged: StagedFile[]
  folders: readonly string[]
  initialPick: FolderPick
  onAddFiles: (files: File[]) => void
  onRemove: (key: string) => void
  onSubmit: (folder: string) => void
}) {
  const [pick, setPick] = useState(initialPick)
  const [error, setError] = useState<string | null>(null)
  const hasProblem = staged.some((s) => validateUpload(s.file))
  // The page's own input sits behind the modal, so the dialog brings its own.
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = resolvePick(pick, folders)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSubmit(result.folder)
  }

  return (
    <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Files</span>
          <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => inputRef.current?.click()}>
            Add files
          </Button>
          <HiddenFileInput inputRef={inputRef} onFiles={onAddFiles} />
        </div>

        {staged.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-muted">
            {pick.select === NEW_FOLDER_VALUE ? 'Name the folder, then add the files that go in it.' : 'Add the files you want to upload.'}
          </p>
        ) : (
          <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {staged.map(({ key, file }) => {
              const problem = validateUpload(file)
              return (
                <li key={key} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
                  <FileIcon kind={fileKind(file.type, file.name)} className="size-5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={file.name}>
                      {file.name}
                    </p>
                    <p className={`text-sm ${problem ? 'text-danger' : 'text-muted'}`}>{problem ?? formatBytes(file.size)}</p>
                  </div>
                  <IconButton label={`Remove ${file.name}`} onClick={() => onRemove(key)}>
                    <X aria-hidden className="size-4" />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        )}
        {hasProblem && <p className="text-sm text-muted">Files marked in red won’t be uploaded.</p>}
      </div>

      <FolderPicker
        folders={folders}
        value={pick}
        onChange={(next) => {
          setPick(next)
          setError(null)
        }}
        error={error}
      />
    </form>
  )
}
