import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { TextField } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { friendlyError } from '../../lib/errors'
import {
  clampFileName,
  folderLabel,
  isReceiptPath,
  pickFolder,
  resolvePick,
  validateFileName,
  type FolderPick,
} from './fileUtils'
import { FolderPicker } from './FolderPicker'
import { useDeleteFile, useMoveFile, useRenameFile, type HouseholdFile } from './hooks'

// Errors show inside the dialog: a toast would sit behind the modal.
function DialogError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-3 text-sm text-danger">
      {friendlyError(error)}
    </p>
  )
}

type DialogProps = {
  /** The file to act on. The dialog is open while this is set. */
  file: HouseholdFile | null
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

export function RenameDialog({ file, onClose }: DialogProps) {
  const rename = useRenameFile()
  const { toast } = useToast()

  const close = () => {
    rename.reset()
    onClose()
  }

  return (
    <Dialog
      open={file !== null}
      onClose={close}
      title="Rename file"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" form="rename-form" variant="primary" loading={rename.isPending}>
            Save
          </Button>
        </>
      }
    >
      {file && (
        <RenameForm
          key={file.id}
          file={file}
          serverError={rename.error}
          onSubmit={(name) => {
            if (clampFileName(name) === file.name) {
              close()
              return
            }
            rename.mutate(
              { id: file.id, name },
              {
                onSuccess: () => {
                  toast('Renamed.')
                  close()
                },
              },
            )
          }}
        />
      )}
    </Dialog>
  )
}

function RenameForm({
  file,
  serverError,
  onSubmit,
}: {
  file: HouseholdFile
  serverError: unknown
  onSubmit: (name: string) => void
}) {
  const [initialName] = useState(file.name)
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Focus the field after the dialog has opened, with the name selected but not the extension.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const input = formRef.current?.querySelector('input')
      if (!input) return
      input.focus()
      const dot = initialName.lastIndexOf('.')
      input.setSelectionRange(0, dot > 0 ? dot : initialName.length)
    })
    return () => cancelAnimationFrame(frame)
  }, [initialName])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const problem = validateFileName(name)
    if (problem) {
      setError(problem)
      return
    }
    onSubmit(name)
  }

  return (
    <form id="rename-form" ref={formRef} onSubmit={submit}>
      <TextField
        label="File name"
        value={name}
        autoComplete="off"
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
        error={error}
      />
      <DialogError error={serverError} />
    </form>
  )
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

export function MoveDialog({ file, folders, onClose }: DialogProps & { folders: readonly string[] }) {
  const move = useMoveFile()
  const { toast } = useToast()

  const close = () => {
    move.reset()
    onClose()
  }

  return (
    <Dialog
      open={file !== null}
      onClose={close}
      title="Move file"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" form="move-form" variant="primary" loading={move.isPending}>
            Move
          </Button>
        </>
      }
    >
      {file && (
        <MoveForm
          key={file.id}
          file={file}
          folders={folders}
          serverError={move.error}
          onSubmit={(folder) => {
            if (folder === file.folder) {
              close()
              return
            }
            move.mutate(
              { id: file.id, folder },
              {
                onSuccess: () => {
                  toast(`Moved to ${folderLabel(folder)}.`)
                  close()
                },
              },
            )
          }}
        />
      )}
    </Dialog>
  )
}

function MoveForm({
  file,
  folders,
  serverError,
  onSubmit,
}: {
  file: HouseholdFile
  folders: readonly string[]
  serverError: unknown
  onSubmit: (folder: string) => void
}) {
  const [pick, setPick] = useState<FolderPick>(pickFolder(file.folder))
  const [error, setError] = useState<string | null>(null)

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
    <form id="move-form" onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Moving <span className="font-medium break-words text-ink">{file.name}</span> from {folderLabel(file.folder)}.
      </p>
      <FolderPicker
        folders={folders}
        value={pick}
        label="Move to"
        error={error}
        onChange={(next) => {
          setPick(next)
          setError(null)
        }}
      />
      <DialogError error={serverError} />
    </form>
  )
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function DeleteDialog({ file, onClose }: DialogProps) {
  const remove = useDeleteFile()
  const { toast } = useToast()

  const close = () => {
    remove.reset()
    onClose()
  }

  return (
    <Dialog
      open={file !== null}
      onClose={close}
      title="Delete file?"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => {
              if (!file) return
              remove.mutate(file, {
                onSuccess: () => {
                  toast('File deleted.')
                  close()
                },
              })
            }}
          >
            Delete
          </Button>
        </>
      }
    >
      {file && (
        <div className="flex flex-col gap-2">
          <p>
            <span className="font-medium break-words">{file.name}</span> will be deleted for both of you. You can’t undo this.
          </p>
          {isReceiptPath(file.storage_path) && (
            <p className="text-sm text-muted">If this receipt is attached to a bill, it disappears from the bill too.</p>
          )}
          <DialogError error={remove.error} />
        </div>
      )}
    </Dialog>
  )
}
