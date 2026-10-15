import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { PageHeader, Segmented } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { BalancePanel } from './BalancePanel'
import { BillDialog } from './BillDialog'
import { describeBillError } from './billErrors'
import { HistoryTab } from './HistoryTab'
import { useMarkUnpaid, type Bill, type RecurringBill, type Settlement } from './hooks'
import { MarkPaidDialog } from './MarkPaidDialog'
import { RecurringDialog } from './RecurringDialog'
import { RecurringTab } from './RecurringTab'
import { SettlementDialog } from './SettlementDialog'
import { SettleUpDialog } from './SettleUpDialog'
import { UpcomingTab } from './UpcomingTab'

type Tab = 'upcoming' | 'history' | 'recurring'

const TABS: { value: Tab; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'history', label: 'History' },
  { value: 'recurring', label: 'Recurring' },
]

type OpenDialog =
  | { kind: 'bill'; bill: Bill | null }
  | { kind: 'mark-paid'; bill: Bill }
  | { kind: 'recurring'; template: RecurringBill | null }
  | { kind: 'settle-up'; myNetCents: number }
  | { kind: 'settlement'; settlement: Settlement }
  | null

export default function BillsPage() {
  const members = useMembers()
  const { me, roommate } = members
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.some((t) => t.value === tabParam) ? (tabParam as Tab) : 'upcoming'
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const close = () => setDialog(null)
  const { toast } = useToast()
  const markUnpaid = useMarkUnpaid()

  const header = (
    <PageHeader
      title="Bills"
      actions={
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({ kind: 'bill', bill: null })}>
          Add bill
        </Button>
      }
    />
  )

  // Splits need both people, so wait for the household before showing anything editable.
  if (members.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Bills" />
        <LoadingBlock label="Loading bills" />
      </div>
    )
  }
  if (members.error || !me) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Bills" />
        <ErrorBlock error={members.error ?? new Error('Your profile didn’t load.')} onRetry={() => void members.refetch()} />
      </div>
    )
  }

  const onPaid = (bill: Bill) =>
    toast(`Marked ${bill.title} paid`, {
      action: {
        label: 'Undo',
        onClick: () => markUnpaid.mutate(bill.id, { onError: (err) => toast(describeBillError(err), { tone: 'error' }) }),
      },
    })

  return (
    <div className="flex flex-col gap-6">
      {header}

      <BalancePanel me={me} roommate={roommate} onSettleUp={(myNetCents) => setDialog({ kind: 'settle-up', myNetCents })} />

      <div className="flex flex-col gap-4">
        <div className="max-w-full overflow-x-auto">
          <Segmented
            label="Show bills"
            value={tab}
            options={TABS}
            onChange={(next) =>
              setParams(
                (p) => {
                  const copy = new URLSearchParams(p)
                  if (next === 'upcoming') copy.delete('tab')
                  else copy.set('tab', next)
                  return copy
                },
                { replace: true },
              )
            }
          />
        </div>

        {tab === 'upcoming' && (
          <UpcomingTab
            onOpen={(bill) => setDialog({ kind: 'bill', bill })}
            onMarkPaid={(bill) => setDialog({ kind: 'mark-paid', bill })}
            onAdd={() => setDialog({ kind: 'bill', bill: null })}
          />
        )}
        {tab === 'history' && (
          <HistoryTab
            onOpenBill={(bill) => setDialog({ kind: 'bill', bill })}
            onOpenSettlement={(settlement) => setDialog({ kind: 'settlement', settlement })}
          />
        )}
        {tab === 'recurring' && (
          <RecurringTab
            onOpen={(template) => setDialog({ kind: 'recurring', template })}
            onAdd={() => setDialog({ kind: 'recurring', template: null })}
          />
        )}
      </div>

      {dialog?.kind === 'bill' && <BillDialog key={dialog.bill?.id ?? 'new'} bill={dialog.bill} onClose={close} />}
      {dialog?.kind === 'mark-paid' && <MarkPaidDialog bill={dialog.bill} onClose={close} onPaid={onPaid} />}
      {dialog?.kind === 'recurring' && (
        <RecurringDialog key={dialog.template?.id ?? 'new'} template={dialog.template} onClose={close} />
      )}
      {dialog?.kind === 'settle-up' && roommate && (
        <SettleUpDialog me={me} roommate={roommate} myNetCents={dialog.myNetCents} onClose={close} />
      )}
      {dialog?.kind === 'settlement' && <SettlementDialog settlement={dialog.settlement} onClose={close} />}
    </div>
  )
}
