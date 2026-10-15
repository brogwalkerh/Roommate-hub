import { Check, CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { PersonChip } from '../../components/Person'
import { TextField } from '../../components/ui/Field'
import { Segmented } from '../../components/ui/Layout'
import type { Profile } from '../../household/useHousehold'
import { centsToInput, formatCents, parseDollars } from '../../lib/money'
import {
  formatBasisPoints,
  parsePercentInput,
  shareOf,
  type SplitResult,
  type SplitType,
} from './split'

const SPLIT_OPTIONS: { value: SplitType; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'exact', label: 'Exact amounts' },
  { value: 'percent', label: 'Percent' },
]

type SplitEditorProps = {
  amountCents: number | null
  split: SplitType
  onSplitChange: (split: SplitType) => void
  /** Household order. */
  members: Profile[]
  exact: Record<string, string>
  percent: Record<string, string>
  onExactChange: (userId: string, value: string) => void
  onPercentChange: (userId: string, value: string) => void
  result: SplitResult
}

/** Split type picker, one row per person, and a live "adds up / $X left" line. */
export function SplitEditor({
  amountCents,
  split,
  onSplitChange,
  members,
  exact,
  percent,
  onExactChange,
  onPercentChange,
  result,
}: SplitEditorProps) {
  // With two people, offer to give the difference to whoever wasn't just edited.
  const [lastEdited, setLastEdited] = useState<string | null>(null)
  const shares = result.ok ? result.shares : null
  const badIds = !result.ok && result.reason === 'input' ? result.badMemberIds : []
  const name = (m: Profile) => m.display_name

  const balanceFix = (() => {
    if (members.length !== 2 || !lastEdited || result.ok) return null
    const other = members.find((m) => m.id !== lastEdited)
    if (!other) return null
    if (result.reason === 'under' || result.reason === 'over') {
      const current = parseDollars(exact[other.id]?.trim() || '0')
      if (current === null) return null
      const next = current + result.remainingCents
      if (next < 0) return null
      return {
        label: `Make ${name(other)}’s share ${formatCents(next)}`,
        apply: () => onExactChange(other.id, centsToInput(next)),
      }
    }
    if (result.reason === 'percent-under' || result.reason === 'percent-over') {
      const current = parsePercentInput(percent[other.id]?.trim() || '0')
      if (current === null) return null
      const next = current + result.remainingBasisPoints
      if (next < 0) return null
      return {
        label: `Make ${name(other)}’s share ${formatBasisPoints(next)}%`,
        apply: () => onPercentChange(other.id, formatBasisPoints(next)),
      }
    }
    return null
  })()

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium">Split</legend>
      <div className="max-w-full overflow-x-auto">
        <Segmented label="How to split" value={split} options={SPLIT_OPTIONS} onChange={onSplitChange} />
      </div>

      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {members.map((m) => {
          const share = shares ? shareOf(shares, m.id) : null
          const invalid = badIds.includes(m.id)
          return (
            <li key={m.id} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">
                <PersonChip person={m} />
              </span>
              {split === 'equal' && (
                <span className="font-medium tabular">{share === null ? '—' : formatCents(share)}</span>
              )}
              {split === 'exact' && (
                <div className="w-32 shrink-0">
                  <TextField
                    label={`${name(m)}’s share in dollars`}
                    hideLabel
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={exact[m.id] ?? ''}
                    aria-invalid={invalid}
                    onChange={(e) => {
                      setLastEdited(m.id)
                      onExactChange(m.id, e.target.value)
                    }}
                    className="text-right tabular"
                  />
                </div>
              )}
              {split === 'percent' && (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="w-20 text-right text-sm text-muted tabular" aria-hidden>
                    {share === null ? '' : formatCents(share)}
                  </span>
                  <div className="w-24">
                    <TextField
                      label={`${name(m)}’s percent`}
                      hideLabel
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={percent[m.id] ?? ''}
                      aria-invalid={invalid}
                      onChange={(e) => {
                        setLastEdited(m.id)
                        onPercentChange(m.id, e.target.value)
                      }}
                      className="text-right tabular"
                    />
                  </div>
                  <span aria-hidden className="text-muted">
                    %
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <SplitStatus amountCents={amountCents} split={split} result={result} members={members} />
      {balanceFix && (
        <div>
          <button
            type="button"
            onClick={balanceFix.apply}
            className="inline-flex min-h-10 items-center rounded-lg px-1 text-sm font-medium text-accent underline underline-offset-4 tabular hover:text-accent-hover"
          >
            {balanceFix.label}
          </button>
        </div>
      )}
    </fieldset>
  )
}

function SplitStatus({
  amountCents,
  split,
  result,
  members,
}: {
  amountCents: number | null
  split: SplitType
  result: SplitResult
  members: Profile[]
}) {
  let tone: 'muted' | 'ok' | 'warn' | 'danger' = 'muted'
  let text: string

  if (result.ok) {
    tone = 'ok'
    if (split === 'equal') {
      const values = result.shares.map((s) => s.share_cents)
      const high = Math.max(...values)
      if (values.every((v) => v === high)) {
        text = members.length === 1 ? 'You cover the whole bill.' : `Each of you pays ${formatCents(high)}.`
      } else {
        const extra = members.filter((m) => shareOf(result.shares, m.id) === high).map((m) => m.display_name)
        text = `Split evenly. ${joinNames(extra)} ${extra.length === 1 ? 'covers' : 'cover'} the extra cent.`
      }
    } else if (split === 'exact') {
      text = `Adds up to ${formatCents(amountCents ?? 0)}.`
    } else {
      text = 'Adds up to 100%.'
    }
  } else {
    switch (result.reason) {
      case 'amount':
        text = 'Enter the amount to see the split.'
        break
      case 'members':
        text = 'Loading the people in your household…'
        break
      case 'input':
        tone = 'danger'
        text = split === 'percent' ? 'Enter percents like 50 or 33.33.' : 'Enter amounts like 42.10.'
        break
      case 'under':
        tone = 'warn'
        text = `${formatCents(result.remainingCents)} left to assign.`
        break
      case 'over':
        tone = 'danger'
        text = `${formatCents(-result.remainingCents)} more than the total.`
        break
      case 'percent-under':
        tone = 'warn'
        text = `${formatBasisPoints(result.remainingBasisPoints)}% left to assign.`
        break
      case 'percent-over':
        tone = 'danger'
        text = `${formatBasisPoints(-result.remainingBasisPoints)}% over 100%.`
        break
    }
  }

  const tones = {
    muted: 'text-muted',
    ok: 'text-accent',
    warn: 'text-warn',
    danger: 'text-danger',
  }
  return (
    <p role="status" className={`flex items-center gap-1.5 text-sm font-medium tabular ${tones[tone]}`}>
      {tone === 'ok' ? (
        <Check aria-hidden className="size-4 shrink-0" />
      ) : tone === 'muted' ? null : (
        <CircleAlert aria-hidden className="size-4 shrink-0" />
      )}
      <span>{text}</span>
    </p>
  )
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
