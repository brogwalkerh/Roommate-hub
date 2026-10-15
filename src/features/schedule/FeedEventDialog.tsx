import { format, formatDistanceToNow } from 'date-fns'
import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { PersonChip } from '../../components/Person'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useMembers } from '../../household/useHousehold'
import { formatRange } from '../../lib/dates'
import type { FeedItem, GuestStay } from './types'

const FULL_DAY = 'EEEE, MMM d, yyyy'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function StayDetails({ stay }: { stay: GuestStay }) {
  return (
    <>
      <dl className="flex flex-col gap-3">
        <Detail label="Check-in">{format(stay.checkIn, FULL_DAY)}</Detail>
        <Detail label="Check-out">{format(stay.checkOut, FULL_DAY)}</Detail>
        <Detail label="Nights">{stay.nights}</Detail>
        {stay.phoneLast4 && <Detail label="Guest phone">Ends in {stay.phoneLast4}</Detail>}
      </dl>
      {stay.reservationUrl && (
        <a
          href={stay.reservationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-medium text-accent-ink transition-colors hover:bg-accent-hover"
        >
          Open reservation in Airbnb
          <ExternalLink className="size-4" aria-hidden />
        </a>
      )}
    </>
  )
}

/** Read-only details for an event that comes from an Airbnb or personal calendar. */
export function FeedEventDialog({ open, item, onClose }: { open: boolean; item: FeedItem; onClose: () => void }) {
  const { byId } = useMembers()
  const { feed } = item
  const owner = byId(item.ownerId)
  const syncedAgo = feed.last_synced_at ? formatDistanceToNow(new Date(feed.last_synced_at), { addSuffix: true }) : null
  const description = feed.privacy === 'busy' ? null : item.raw.description?.trim()
  const location = feed.privacy === 'busy' ? null : item.raw.location?.trim()

  let body: ReactNode
  if (item.stay) {
    body = <StayDetails stay={item.stay} />
  } else if (item.kind === 'blocked') {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-muted">Airbnb marks these dates as not available, so no one can book them.</p>
        <dl>
          <Detail label="Dates">{formatRange(item.start, item.end, item.allDay)}</Detail>
        </dl>
      </div>
    )
  } else {
    body = (
      <dl className="flex flex-col gap-3">
        <Detail label="When">{formatRange(item.start, item.end, item.allDay)}</Detail>
        <Detail label="Calendar">
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {feed.name}
            <PersonChip person={owner} bothLabel="Household" />
          </span>
        </Detail>
        {location && <Detail label="Where">{location}</Detail>}
        {description && <Detail label="Notes"><span className="whitespace-pre-wrap">{description}</span></Detail>}
      </dl>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item.title}
      footer={
        <>
          {item.feedKind === 'airbnb' && syncedAgo ? (
            <p className="mr-auto self-center text-sm text-muted">Synced {syncedAgo}</p>
          ) : null}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {body}
    </Dialog>
  )
}
