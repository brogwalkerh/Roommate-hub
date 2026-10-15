import { SelectField, TextField } from '../../components/ui/Field'
import { MAX_FOLDER_LENGTH, NEW_FOLDER_VALUE, UNFILED_LABEL, type FolderPick } from './fileUtils'

/**
 * Choose a folder: an existing one, Unfiled, or "New folder…" with a name field.
 * A folder exists once a file is in it, so a new name only takes effect when a file lands there.
 * `folders` are the existing folder values ("" is Unfiled, always offered).
 */
export function FolderPicker({
  folders,
  value,
  onChange,
  error,
  label = 'Folder',
}: {
  folders: readonly string[]
  value: FolderPick
  onChange: (next: FolderPick) => void
  error?: string | null
  label?: string
}) {
  const picked = value.select.startsWith('f:') ? value.select.slice(2) : null
  // Keep the current choice in the list even if its last file just left the folder.
  const names = new Set(folders)
  if (picked !== null) names.add(picked)
  names.delete('')
  const options = [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }))
  const isNew = value.select === NEW_FOLDER_VALUE

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={label}
        value={value.select}
        onChange={(e) => onChange({ select: e.target.value, newName: value.newName })}
        error={isNew ? null : error}
      >
        {options.map((folder) => (
          <option key={folder} value={`f:${folder}`}>
            {folder}
          </option>
        ))}
        <option value="f:">{UNFILED_LABEL}</option>
        <option value={NEW_FOLDER_VALUE}>New folder…</option>
      </SelectField>
      {isNew && (
        <TextField
          label="New folder name"
          value={value.newName}
          maxLength={MAX_FOLDER_LENGTH}
          autoComplete="off"
          autoFocus
          placeholder="Lease, Wi-Fi, Manuals…"
          error={error}
          onChange={(e) => onChange({ select: value.select, newName: e.target.value })}
        />
      )}
    </div>
  )
}
