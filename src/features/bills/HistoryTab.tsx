import { ArrowRightLeft, History } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { useMembers } from '../../household/useHousehold'
import { formatCents } from '../../lib/money'
import { BillRow } from './BillRow'
import { groupHistory } from './history'
import { usePaidBills, useSettlements, useToday, type Bill, type Settlement } from './hooks'
import { formatBillDate } from './schedule'
import { shareOf } from './split'
import { settlementSentence } from './wording'

/** Paid bills and settle-ups by month, newest first. */
export function HistoryTab({
  onOpenBill,
  onOpenSettlement,
}: {
  onOpenBill: (bill: Bill) => void
  onOpenSettlement: (settlement: Settlement) => void
}) {
  const bills = usePaidBills()
  const settlements = useSettlements()
  const { me, byId } = useMembers()
  const today = useToday()
  const myId = me?.id

  const months = useMemo(
    () => groupHistory(bills.data ?? [], settlements.data ?? [], (b) => shareOf(b.bill_shares, myId)),
    [bills.data, settlements.data, myId],
  )

  if (bills.isLoading || settlements.isLoading) return <LoadingBlock label="Loading history" />
  const error = bills.error ?? settlements.error
  if (error) {
    return (
      <ErrorBlock
        error={error}
        onRetry={() => {
          void bills.refetch()
          void settlements.refetch()
        }}
      />
    )
  }
  if (months.length === 0) {
    return (
      <EmptyState icon={<History />} title="No history yet">
        Paid bills and settle-up payments show up here, month by month.
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {months.map((month) => (
        <section key={month.key} aria-labelledby={`month-${month.key}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1">
            <h2 id={`month-${month.key}`} className="text-base font-semibold">
              {month.label}
            </h2>
            <p className="text-sm text-muted tabular">
              {formatCents(month.billsTotalCents)} in bills
              {month.billsTotalCents > 0 && <>, your share {formatCents(month.myShareCents)}</>}
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {month.entries.map((entry) =>
              entry.kind === 'bill' ? (
                <BillRow
                  key={`b-${entry.item.id}`}
                  bill={entry.item}
                  today={today}
                  myId={myId}
                  payer={byId(entry.item.paid_by)}
                  onOpen={() => onOpenBill(entry.item)}
                />
              ) : (
                <SettlementRow
                  key={`s-${entry.item.id}`}
                  settlement={entry.item}
                  sentence={settlementSentence(entry.item, myId, byId)}
                  dateLabel={formatBillDate(entry.item.paid_on, today)}
                  onOpen={() => onOpenSettlement(entry.item)}
                />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}

function SettlementRow({
  settlement,
  sentence,
  dateLabel,
  onOpen,
}: {
  settlement: Settlement
  sentence: string
  dateLabel: string
  onOpen: () => void
}) {
  return (
    <li className="relative flex gap-3 rounded-xl border border-line bg-surface-2/50 p-3 transition-colors hover:bg-surface-2 sm:p-4">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <ArrowRightLeft className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 text-left leading-snug font-medium after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {sentence}
          </button>
          <span className="shrink-0 font-semibold tabular">{formatCents(settlement.amount_cents)}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          Settled up {dateLabel}
          {settlement.note && <span className="break-words">: {settlement.note}</span>}
        </p>
      </div>
    </li>
  )
}
