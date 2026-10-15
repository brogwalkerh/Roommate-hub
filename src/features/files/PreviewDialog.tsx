import { Download, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { friendlyError } from '../../lib/errors'
import { fileKind, formatBytes, formatUploaded } from './fileUtils'
import { FileIcon } from './FileIcon'
import { usePreviewUrl, type HouseholdFile } from './hooks'
import { useMediaQuery } from './useMediaQuery'

const linkButton =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-[0.95rem] font-medium transition-colors'

/** Big enough for an inline PDF viewer and a mouse. Touch screens get a link instead. */
const PDF_INLINE_QUERY = '(min-width: 768px) and (pointer: fine)'

/**
 * Preview one file: images inline, PDFs in a frame on wide screens or behind an "Open PDF" link
 * on phones, and a Download button for everything else.
 */
export function PreviewDialog({
  file,
  downloading,
  downloadError,
  onDownload,
  onClose,
}: {
  file: HouseholdFile | null
  downloading: boolean
  /** Shown inside the dialog: a toast would sit behind the modal. */
  downloadError: unknown
  onDownload: (file: HouseholdFile) => void
  onClose: () => void
}) {
  const { url, error, loading } = usePreviewUrl(file)
  const inlinePdf = useMediaQuery(PDF_INLINE_QUERY)
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)

  const kind = file ? fileKind(file.mime_type, file.name) : 'other'
  const imageBroken = url !== null && brokenUrl === url
  const showsPreview = !!url && ((kind === 'image' && !imageBroken) || (kind === 'pdf' && inlinePdf))

  return (
    <Dialog
      open={file !== null}
      onClose={onClose}
      title="Preview"
      size="lg"
      footer={
        file && (
          <>
            {kind === 'pdf' && url && inlinePdf && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${linkButton} border border-line bg-surface text-ink hover:bg-surface-2`}
              >
                <ExternalLink aria-hidden className="size-4" />
                Open in new tab
              </a>
            )}
            <Button
              variant={showsPreview ? 'secondary' : 'primary'}
              icon={<Download aria-hidden className="size-4" />}
              loading={downloading}
              onClick={() => onDownload(file)}
            >
              Download
            </Button>
          </>
        )
      }
    >
      {file && (
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <p className="font-medium break-words">{file.name}</p>
            <p className="text-sm text-muted">
              {formatBytes(file.size_bytes)} · {formatUploaded(file.created_at)}
            </p>
          </div>

          {loading ? (
            <LoadingBlock label="Loading preview" />
          ) : error ? (
            <ErrorBlock error={error} />
          ) : url && kind === 'image' && !imageBroken ? (
            <img
              src={url}
              alt={file.name}
              onError={() => setBrokenUrl(url)}
              className="mx-auto max-h-[60dvh] max-w-full rounded-lg bg-surface-2 object-contain"
            />
          ) : url && kind === 'pdf' && inlinePdf ? (
            <iframe
              src={url}
              title={`Preview of ${file.name}`}
              className="h-[62dvh] w-full rounded-lg border border-line bg-surface-2"
            />
          ) : url && kind === 'pdf' ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-2 px-4 py-8 text-center">
              <FileIcon kind="pdf" className="size-10 text-muted" />
              <p className="text-muted">Open this PDF in your browser’s viewer.</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${linkButton} bg-accent text-accent-ink hover:bg-accent-hover`}
              >
                <ExternalLink aria-hidden className="size-4" />
                Open PDF
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-2 px-4 py-8 text-center">
              <FileIcon kind={kind} className="size-10 text-muted" />
              <p className="text-muted">
                {imageBroken ? 'This browser can’t show this image.' : 'There’s no preview for this type of file.'} Download it to
                open it.
              </p>
            </div>
          )}

          {downloadError ? (
            <p role="alert" className="text-sm text-danger">
              {friendlyError(downloadError)}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  )
}
