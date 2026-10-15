// Small pieces shared by the Bills dialogs and lists.

import { Trash2 } from 'lucide-react'
import { PersonChip } from '../../components/Person'
import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Layout'
import type { Profile } from '../../household/useHousehold'
import { categoryFor } from './categories'

/** Round category icon. Danger tone for overdue bills. */
export function CategoryBadge({ category, tone = 'default' }: { category: string; tone?: 'default' | 'danger' | 'accent' }) {
  const Icon = categoryFor(category).icon
  const tones = {
    default: 'bg-surface-2 text-muted',
    danger: 'bg-danger-soft text-danger',
    accent: 'bg-accent-soft text-accent',
  }
  return (
    <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full ${tones[tone]}`}>
      <Icon className="size-5" />
    </span>
  )
}

/** On/off toggle with a 40px touch target. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex h-10 w-14 shrink-0 items-center justify-center rounded-full disabled:opacity-55"
    >
      <span
        className={`flex h-7 w-12 items-center rounded-full border p-0.5 transition-colors ${checked ? 'border-accent bg-accent' : 'border-line bg-surface-2'}`}
      >
        <span
          className={`size-5.5 rounded-full shadow-sm transition-transform ${checked ? 'translate-x-5 bg-accent-ink' : 'translate-x-0 bg-muted'}`}
        />
      </span>
    </button>
  )
}

/** Pick one of the household members (no "both" option). */
export function PayerPicker({
  label,
  value,
  onChange,
  members,
  noneLabel,
}: {
  label: string
  value: string | null
  onChange: (id: string | null) => void
  members: Profile[]
  /** Adds a "nobody" option with this label (value null). */
  noneLabel?: string
}) {
  const options = [
    ...members.map((m) => ({ value: m.id, label: <PersonChip person={m} /> })),
    ...(noneLabel ? [{ value: 'none', label: <span className="text-sm">{noneLabel}</span> }] : []),
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="max-w-full overflow-x-auto">
        <Segmented
          label={label}
          value={value ?? (noneLabel ? 'none' : '')}
          options={options}
          onChange={(v) => onChange(v === 'none' ? null : v)}
        />
      </div>
    </div>
  )
}

/** Footer contents for the "are you sure?" step of a delete. Focuses the safe choice. */
export function ConfirmDeleteFooter({
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  loading,
}: {
  message: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  loading: boolean
}) {
  return (
    <>
      <p role="alert" className="mr-auto basis-full self-center text-sm font-medium text-danger sm:basis-auto">
        {message}
      </p>
      {/* Focus the safe choice so a second tap or Enter doesn't delete. */}
      <Button autoFocus onClick={onCancel} disabled={loading}>
        Keep it
      </Button>
      <Button variant="danger" icon={<Trash2 className="size-4" />} loading={loading} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </>
  )
}
