import type { FilterKey } from './filters'

export type FilterChip = {
  key: FilterKey
  label: string
  /** CSS color for the dot: a profile or feed hex color, or a token such as `var(--guest)`. */
  color: string
}

/**
 * Toggle buttons for what the calendar shows. A filled dot means shown and a
 * hollow dot means hidden, so the state doesn't depend on color alone.
 */
export function FilterChips({
  chips,
  hidden,
  onToggle,
}: {
  chips: FilterChip[]
  hidden: readonly FilterKey[]
  onToggle: (key: FilterKey) => void
}) {
  return (
    <div role="group" aria-label="Show on calendar" className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const shown = !hidden.includes(chip.key)
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={shown}
            onClick={() => onToggle(chip.key)}
            className={`inline-flex h-10 max-w-full items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${
              shown ? 'border-line bg-surface-2 text-ink' : 'border-line bg-transparent text-muted hover:bg-surface-2'
            }`}
          >
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full border-2"
              style={{ borderColor: chip.color, background: shown ? chip.color : 'transparent' }}
            />
            <span className="truncate">{chip.label}</span>
          </button>
        )
      })}
    </div>
  )
}
