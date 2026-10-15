import { useMembers, type Profile } from '../household/useHousehold'
import { Segmented } from './ui/Layout'

/** Colored dot for a person; household color when no person. */
export function PersonDot({ person, className = 'size-2.5' }: { person: Profile | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ background: person?.color ?? 'var(--accent)' }}
    />
  )
}

/** "● Sam" chip; "● Both" when person is null. */
export function PersonChip({ person, bothLabel = 'Both' }: { person: Profile | null; bothLabel?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted">
      <PersonDot person={person} />
      {person?.display_name ?? bothLabel}
    </span>
  )
}

/**
 * Pick me / my roommate / both. Value is a profile id, or null for both.
 * Used for event owners and reminder assignees.
 */
export function PersonPicker({
  label,
  value,
  onChange,
  bothLabel = 'Both',
}: {
  label: string
  value: string | null
  onChange: (id: string | null) => void
  bothLabel?: string
}) {
  const { me, roommate } = useMembers()
  const options = [
    ...(me ? [{ value: me.id, label: <PersonChip person={me} /> }] : []),
    ...(roommate ? [{ value: roommate.id, label: <PersonChip person={roommate} /> }] : []),
    { value: 'both', label: <PersonChip person={null} bothLabel={bothLabel} /> },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Segmented label={label} value={value ?? 'both'} options={options} onChange={(v) => onChange(v === 'both' ? null : v)} />
    </div>
  )
}
