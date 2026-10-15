import type { RefObject } from 'react'

/**
 * A file input that stays out of sight; call `inputRef.current?.click()` from a button.
 * No `accept` and no `capture`, so phones offer the camera, photo library and Files app.
 * Resets after each pick so choosing the same file twice still fires.
 */
export function HiddenFileInput({
  inputRef,
  onFiles,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  onFiles: (files: File[]) => void
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      multiple
      hidden
      tabIndex={-1}
      onChange={(event) => {
        const picked = Array.from(event.target.files ?? [])
        event.target.value = ''
        if (picked.length > 0) onFiles(picked)
      }}
    />
  )
}
