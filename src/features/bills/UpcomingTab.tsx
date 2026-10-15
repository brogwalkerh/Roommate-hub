import { Check, Plus, ReceiptText } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { useMembers } from '../../household/useHousehold'
import { formatCents } from '../../lib/money'
import { BillRow } from './BillRow'
import { useToday, useUnpaidBills, type Bill } from './hooks'
import { isOverdue } from './schedule'
import { shareOf } from './split'

/** Unpaid bills, soonest first, overdue ones flagged. */
export function UpcomingTab({
  onOpen,
  onMarkPaid,
  onAdd,
}: {
  onOpen: (bill: Bill) => void
  onMarkPaid: (bill: Bill) => void
  onAdd: () => void
}) {
  const { data: bills, isLoading, error, refetch } = useUnpaidBills()
  const { me, byId } = useMembers()
  const today = useToday()

  if (isLoading) return <LoadingBlock label="Loading bills" />
  if (error) return <ErrorBlock error={error} onRetry={() => void refetch()} />
  if (!bills || bills.length === 0) {
    return (
      <EmptyState
        icon={<Check />}
        title="Nothing to pay right now"
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={onAdd}>
            Add bill
          </Button>
        }
      >
        Add a bill when one comes in. Recurring bills show up here on their own.
      </EmptyState>
    )
  }

  const totalCents = bills.reduce((t, b) => t + b.amount_cents, 0)
  const myCents = bills.reduce((t, b) => t + shareOf(b.bill_shares, me?.id), 0)
  const overdueCount = bills.filter((b) => isOverdue(b.due_on, today)).length

  return (
    <section aria-label="Upcoming bills" className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted tabular">
        <ReceiptText aria-hidden className="size-4" />
        <span>
          {bills.length} unpaid, {formatCents(totalCents)} in all. Your share: {formatCents(myCents)}.
        </span>
        {overdueCount > 0 && <span className="font-medium text-danger">{overdueCount} overdue.</span>}
      </p>
      <ul className="flex flex-col gap-2">
        {bills.map((bill) => (
          <BillRow
            key={bill.id}
            bill={bill}
            today={today}
            myId={me?.id}
            payer={byId(bill.paid_by)}
            onOpen={() => onOpen(bill)}
            action={
              <Button
                variant={isOverdue(bill.due_on, today) ? 'primary' : 'secondary'}
                icon={<Check className="size-4" />}
                aria-label={`Mark paid: ${bill.title}`}
                onClick={() => onMarkPaid(bill)}
              >
                Mark paid
              </Button>
            }
          />
        ))}
      </ul>
    </section>
  )
}
