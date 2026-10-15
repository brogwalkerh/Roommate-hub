import { useEffect, useRef, useState } from 'react'

type Dropped = { files: File[]; skippedFolders: number }

/** Files from a drop, leaving out dropped folders (they can't be read as a single file). */
function readDropped(data: DataTransfer): Dropped {
  const files: File[] = []
  let skippedFolders = 0
  const items = Array.from(data.items ?? [])
  if (items.length === 0) return { files: Array.from(data.files), skippedFolders }
  for (const item of items) {
    if (item.kind !== 'file') continue
    if (item.webkitGetAsEntry?.()?.isDirectory) {
      skippedFolders += 1
      continue
    }
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return { files, skippedFolders }
}

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

/**
 * Accept files dropped anywhere on the window (desktop). Returns true while files are being dragged
 * over the page, for the drop overlay. Drops are always cancelled so a miss never makes the browser
 * leave the app to open the file; when `enabled` is false they are ignored.
 */
export function useFileDrop(onDrop: (files: File[], skippedFolders: number) => void, enabled: boolean): boolean {
  const [dragging, setDragging] = useState(false)
  const latest = useRef({ onDrop, enabled })

  useEffect(() => {
    latest.current = { onDrop, enabled }
  })

  useEffect(() => {
    let depth = 0

    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth += 1
      setDragging(true)
    }
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = latest.current.enabled ? 'copy' : 'none'
    }
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDropEvent = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      if (!latest.current.enabled || !event.dataTransfer) return
      const { files, skippedFolders } = readDropped(event.dataTransfer)
      if (files.length > 0 || skippedFolders > 0) latest.current.onDrop(files, skippedFolders)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDropEvent)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDropEvent)
    }
  }, [])

  return dragging && enabled
}
