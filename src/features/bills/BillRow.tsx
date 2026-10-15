import { Paperclip, Repeat, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { PersonDot } from '../../components/Person'
import type { Profile } from '../../household/useHousehold'
import { formatCents } from '../../lib/money'
import { categoryFor } from './categories'
import type { Bill } from './hooks'
import { CategoryBadge } from './parts'
import { describeDue, describePaid } from './schedule'
import { shareOf } from './split'

/**
 * One bill: title, category, amount, due or paid date, who paid and your
 * share. The whole card opens the bill; `action` sits on top of it.
 */
export function BillRow({
  bill,
  today,
  myId,
  payer,
  onOpen,
  action,
}: {
  bill: Bill
  today: string
  myId: string | undefined
  payer: Profile | null
  onOpen: () => void
  action?: ReactNode
}) {
  const due = describeDue(bill.due_on, today)
  const overdue = bill.paid_on === null && due.overdue
  const dateLabel = bill.paid_on ? describePaid(bill.paid_on, today) : due.label
  const payerName = payer ? (payer.id === myId ? 'you' : payer.display_name) : 'a former roommate'

  return (
    <li
      className={`relative flex gap-3 rounded-xl border bg-surface p-3 transition-colors hover:bg-surface-2/60 sm:p-4 ${overdue ? 'border-danger/50' : 'border-line'}`}
    >
      <CategoryBadge category={bill.category} tone={overdue ? 'danger' : 'default'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 text-left leading-snug font-medium break-words after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {bill.title}
          </button>
          <span className="shrink-0 font-semibold tabular">{formatCents(bill.amount_cents)}</span>
        </div>
        <p
          className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm ${overdue ? 'font-medium text-danger' : 'text-muted'}`}
        >
          <span className="sr-only">{categoryFor(bill.category).label}. </span>
          {overdue && <TriangleAlert aria-hidden className="size-4 shrink-0" />}
          <span>{dateLabel}</span>
          {bill.paid_on && (
            <span className="inline-flex items-center gap-1">
              by <PersonDot person={payer} /> {payerName}
            </span>
          )}
          {bill.recurring_bill_id && (
            <span title="Repeats monthly" className="inline-flex">
              <Repeat aria-hidden className="size-3.5" />
              <span className="sr-only">Repeats monthly.</span>
            </span>
          )}
          {bill.receipt_path && (
            <span title="Has a receipt" className="inline-flex">
              <Paperclip aria-hidden className="size-3.5" />
              <span className="sr-only">Has a receipt.</span>
            </span>
          )}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="min-w-0 text-sm text-muted tabular">
            Your share: <span className="font-medium whitespace-nowrap text-ink">{formatCents(shareOf(bill.bill_shares, myId))}</span>
          </p>
          {action && <div className="relative z-10 shrink-0">{action}</div>}
        </div>
      </div>
    </li>
  )
}
