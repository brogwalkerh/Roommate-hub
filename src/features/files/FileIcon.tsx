import {
  File,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  ImageIcon,
  type LucideIcon,
} from 'lucide-react'
import type { FileKind } from './fileUtils'

const ICONS: Record<FileKind, LucideIcon> = {
  image: ImageIcon,
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  archive: FileArchive,
  audio: FileAudio,
  video: FileVideo,
  other: File,
}

/** The icon for a kind of file. Decorative: the file name sits next to it. */
export function FileIcon({ kind, className = 'size-6' }: { kind: FileKind; className?: string }) {
  const Icon = ICONS[kind]
  return <Icon aria-hidden className={className} />
}
