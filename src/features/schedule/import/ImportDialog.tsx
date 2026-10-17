import { startOfWeek } from 'date-fns'
import { FileUp, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { PersonPicker } from '../../../components/Person'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Checkbox, TextField } from '../../../components/ui/Field'
import { LoadingBlock } from '../../../components/ui/Status'
import { useMembers } from '../../../household/useHousehold'
import { toDateInput } from '../../../lib/dates'
import { friendlyError } from '../../../lib/errors'
import { useImportEvents, useParseSchedule } from './hooks'
import { rowProblem, rowToFields, type ImportRow } from './importRows'
import { SCHEDULE_ACCEPT, scheduleFileKind } from './readScheduleFile'

type Props = { onClose: () => void }

/** Upload a schedule (PDF, photo, spreadsheet), check what was read, then add it to the calendar. */
export function ImportDialog({ onClose }: Props) {
  const { me } = useMembers()
  const parse = useParseSchedule()
  const add = useImportEvents()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [weekOf, setWeekOf] = useState(() => toDateInput(startOfWeek(new Date(), { weekStartsOn: 1 })))
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  // undefined until picked: defaults to me, even if profiles load after the dialog opens.
  const [pickedOwner, setOwnerId] = useState<string | null | undefined>(undefined)
  const ownerId = pickedOwner === undefined ? (me?.id ?? null) : pickedOwner

  const pick = (picked: File | undefined) => {
    if (!picked) return
    parse.reset()
    if (!scheduleFileKind(picked)) {
      setFile(null)
      setFileError(friendlyError(new Error('unsupported_file')))
      return
    }
    setFileError(null)
    setFile(picked)
  }

  const read = () => {
    if (!file) return
    parse.mutate(
      { file, today: toDateInput(new Date()), weekOf },
      {
        onSuccess: (result) => {
          setRows(result.rows)
          setWarnings(result.warnings)
        },
      },
    )
  }

  if (rows === null) {
    return (
      <Dialog
        open
        onClose={onClose}
        title="Import a schedule"
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!file} loading={parse.isPending} onClick={read}>
              Read schedule
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            Upload a work rota, class timetable or any schedule. You’ll check every event before anything is added.
          </p>
          <FilePicker file={file} onPick={pick} disabled={parse.isPending} />
          {fileError && (
            <p role="alert" className="text-sm text-danger">
              {fileError}
            </p>
          )}
          <TextField
            label="Week of"
            type="date"
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
            hint="Only used when the schedule lists weekdays without dates."
          />
          {parse.isPending && <LoadingBlock label="Reading your schedule. This can take up to a minute." />}
          {parse.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {friendlyError(parse.error)}
            </p>
          )}
        </div>
      </Dialog>
    )
  }

  const chosen = rows.filter((r) => r.include)
  const hasProblem = chosen.some((r) => rowProblem(r) !== null)
  const update = (key: string, patch: Partial<ImportRow>) =>
    setRows((prev) => prev && prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const setAll = (include: boolean) => setRows((prev) => prev && prev.map((r) => ({ ...r, include })))
  const submit = () => {
    if (chosen.length === 0 || hasProblem) return
    add.mutate(
      chosen.map((r) => rowToFields(r, ownerId)),
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog
      open
      onClose={add.isPending ? () => {} : onClose}
      title="Check the events"
      size="lg"
      footer={
        <>
          <Button className="mr-auto" onClick={() => setRows(null)} disabled={add.isPending}>
            Back
          </Button>
          <Button variant="primary" disabled={chosen.length === 0 || hasProblem} loading={add.isPending} onClick={submit}>
            {chosen.length === 1 ? 'Add 1 event' : `Add ${chosen.length} events`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {warnings.length > 0 && (
          <div role="note" className="flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <ul className="flex flex-col gap-1">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-muted">No events found in that file. Go back and try a clearer photo or another file.</p>
        ) : (
          <>
            <PersonPicker label="Whose schedule is it?" bothLabel="Household" value={ownerId} onChange={setOwnerId} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="mr-auto text-sm text-muted">
                Found {rows.length === 1 ? '1 event' : `${rows.length} events`}. Untick any you don’t want, or fix them first.
              </p>
              <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAll(false)}>
                Select none
              </Button>
            </div>
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <RowEditor key={row.key} row={row} onChange={(patch) => update(row.key, patch)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  )
}

function FilePicker({ file, onPick, disabled }: { file: File | null; onPick: (f: File | undefined) => void; disabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!disabled) onPick(e.dataTransfer.files[0])
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center ${
        dragging ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2'
      }`}
    >
      <FileUp aria-hidden className="size-8 text-muted" />
      {file ? (
        <p className="font-medium break-all">{file.name}</p>
      ) : (
        <p className="text-muted">PDF, photo or screenshot, or spreadsheet (Excel, CSV)</p>
      )}
      <Button data-autofocus disabled={disabled} onClick={() => inputRef.current?.click()}>
        {file ? 'Choose another file' : 'Choose a file'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={SCHEDULE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

function RowEditor({ row, onChange }: { row: ImportRow; onChange: (patch: Partial<ImportRow>) => void }) {
  const id = useId()
  const problem = row.include ? rowProblem(row) : null
  return (
    <li className={`rounded-xl border p-3 ${row.include ? 'border-line bg-surface' : 'border-line/60 bg-surface-2 opacity-70'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={`Add ${row.title || 'this event'}`}
          checked={row.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="mt-2.5 size-5 shrink-0 rounded accent-[var(--accent)]"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TextField
            label="Name"
            hideLabel
            value={row.title}
            maxLength={200}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[10rem_9rem_9rem_1fr]">
            <div className="col-span-2 sm:col-span-1">
              <TextField label="Date" type="date" value={row.startDay} onChange={(e) => onChange({ startDay: e.target.value })} />
            </div>
            {row.allDay ? (
              <div className="col-span-2">
                <TextField
                  label="Until"
                  type="date"
                  value={row.endDay}
                  min={row.startDay}
                  onChange={(e) => onChange({ endDay: e.target.value })}
                />
              </div>
            ) : (
              <>
                <TextField label="Starts" type="time" value={row.startTime} onChange={(e) => onChange({ startTime: e.target.value })} />
                <TextField label="Ends" type="time" value={row.endTime} onChange={(e) => onChange({ endTime: e.target.value })} />
              </>
            )}
            <Checkbox
              id={`${id}-allday`}
              label="All day"
              className="col-span-2 min-h-10 sm:col-span-1"
              checked={row.allDay}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? { allDay: true, endDay: row.endDay < row.startDay ? row.startDay : row.endDay }
                    : { allDay: false, startTime: row.startTime || '09:00', endTime: row.endTime || '17:00' },
                )
              }
            />
          </div>
          {(row.location || row.notes) && (
            <p className="text-sm break-words text-muted">{[row.location, row.notes].filter(Boolean).join(' · ')}</p>
          )}
          {row.duplicate && (
            <p className="w-fit rounded-md bg-warn-soft px-2 py-0.5 text-sm font-medium text-warn">Already on the calendar</p>
          )}
          {problem && (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}
