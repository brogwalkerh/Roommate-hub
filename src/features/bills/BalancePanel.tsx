import { CircleCheck, HandCoins } from 'lucide-react'
import { PersonChip } from '../../components/Person'
import { Button } from '../../components/ui/Button'
import { Panel, SectionLabel } from '../../components/ui/Layout'
import { ErrorBlock } from '../../components/ui/Status'
import type { Profile } from '../../household/useHousehold'
import { formatCents } from '../../lib/money'
import { useBalance } from './hooks'
import { balanceSummary } from './split'

/** "Sam owes you $42.10", both people's net, and Settle up. */
export function BalancePanel({
  me,
  roommate,
  onSettleUp,
}: {
  me: Profile | null
  roommate: Profile | null
  onSettleUp: (myNetCents: number) => void
}) {
  const { myNetCents, roommateNetCents, isLoading, error, refetch } = useBalance()

  if (error) {
    return <ErrorBlock error={error} onRetry={() => void refetch()} />
  }

  return (
    <Panel className="p-5 sm:p-6">
      <SectionLabel>Balance</SectionLabel>
      {isLoading ? (
        <div role="status" className="mt-3 flex flex-col gap-3" aria-label="Loading the balance">
          <div className="h-9 w-3/4 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
        </div>
      ) : (
        <>
          <p
            aria-live="polite"
            className="mt-2 flex items-center gap-2 font-display text-2xl leading-tight font-bold tracking-tight tabular sm:text-3xl"
          >
            {myNetCents === 0 && <CircleCheck aria-hidden className="size-7 shrink-0 text-accent" />}
            <span>{balanceSummary(myNetCents, roommate?.display_name)}</span>
          </p>
          {!roommate && <p className="mt-1 text-muted">Your roommate hasn’t joined yet.</p>}

          <dl className={`mt-4 grid gap-3 ${roommate ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {me && <NetTile person={me} netCents={myNetCents} />}
            {roommate && <NetTile person={roommate} netCents={roommateNetCents} />}
          </dl>

          {roommate && myNetCents !== 0 && (
            <Button
              variant="primary"
              className="mt-4 w-full sm:w-auto"
              icon={<HandCoins className="size-4" />}
              onClick={() => onSettleUp(myNetCents)}
            >
              Settle up
            </Button>
          )}
        </>
      )}
    </Panel>
  )
}

function NetTile({ person, netCents }: { person: Profile; netCents: number }) {
  const caption = netCents > 0 ? 'Gets back' : netCents < 0 ? 'Owes' : 'All even'
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3">
      <dt className="truncate">
        <PersonChip person={person} />
      </dt>
      <dd className="mt-1">
        <span className="block text-sm text-muted">{caption}</span>
        <span className="block text-lg font-semibold tabular">{formatCents(Math.abs(netCents))}</span>
      </dd>
    </div>
  )
}
