import { Plus, Repeat } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { friendlyError } from '../../lib/errors'
import { formatCents } from '../../lib/money'
import { describeBillError } from './billErrors'
import { useRecurringBills, useSetRecurringActive, useToday, type RecurringBill } from './hooks'
import { CategoryBadge, Switch } from './parts'
import { describeMonthlyDay, formatBillDate, nextRecurringBill } from './schedule'
import { describeSplit, personName } from './wording'

/** Monthly bill templates with an on/off switch each. */
export function RecurringTab({ onOpen, onAdd }: { onOpen: (template: RecurringBill) => void; onAdd: () => void }) {
  const { data: templates, isLoading, error, refetch } = useRecurringBills()
  const { me, byId } = useMembers()
  const today = useToday()
  const { toast } = useToast()
  const setActive = useSetRecurringActive()

  const addButton = (
    <Button icon={<Plus className="size-4" />} onClick={onAdd}>
      Add recurring bill
    </Button>
  )

  if (isLoading) return <LoadingBlock label="Loading recurring bills" />
  if (error) return <ErrorBlock error={error} onRetry={() => void refetch()} />
  if (!templates || templates.length === 0) {
    return (
      <EmptyState icon={<Repeat />} title="No recurring bills" action={addButton}>
        Set up rent, internet and other monthly bills once. Each one shows up in Upcoming before it’s due.
      </EmptyState>
    )
  }

  const toggle = (template: RecurringBill, active: boolean) =>
    setActive.mutate(
      { id: template.id, active },
      {
        onSuccess: ({ generated, generateError }) => {
          if (generateError) toast(friendlyError(generateError), { tone: 'error' })
          else if (generated && generated > 0) toast(`Turned on ${template.title}. The next bill is in Upcoming.`)
          else toast(active ? `Turned on ${template.title}` : `Paused ${template.title}`)
        },
        onError: (err) => toast(describeBillError(err), { tone: 'error' }),
      },
    )

  return (
    <section aria-label="Recurring bills" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Bills that come back every month.</p>
        {addButton}
      </div>
      <ul className="flex flex-col gap-2">
        {templates.map((t) => {
          const next = nextRecurringBill(t.day_of_month, t.lead_days, today)
          const pending = setActive.isPending && setActive.variables?.id === t.id
          return (
            <li
              key={t.id}
              className="relative flex gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:bg-surface-2/60 sm:p-4"
            >
              <CategoryBadge category={t.category} tone={t.active ? 'accent' : 'default'} />
              <div className={`min-w-0 flex-1 ${t.active ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onOpen(t)}
                    className="min-w-0 text-left leading-snug font-medium break-words after:absolute after:inset-0 after:rounded-xl after:content-['']"
                  >
                    {t.title}
                  </button>
                  <span className="shrink-0 font-semibold tabular">{formatCents(t.amount_cents)}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted">{describeMonthlyDay(t.day_of_month)}</p>
                <p className="text-sm text-muted tabular">
                  {describeSplit(t.split, t.shares, byId)}
                  {t.default_payer && <>. Usually paid by {personName(t.default_payer, me?.id, byId, false)}</>}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-sm">
                    {t.active ? (
                      <>Next due {formatBillDate(next.dueOn, today)}</>
                    ) : (
                      <span className="text-muted">Paused</span>
                    )}
                  </p>
                  <div className="relative z-10 -my-1">
                    <Switch
                      checked={t.active}
                      disabled={pending}
                      label={`Add ${t.title} bills automatically`}
                      onChange={(active) => toggle(t, active)}
                    />
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
