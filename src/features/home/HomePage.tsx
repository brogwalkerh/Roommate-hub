import { format } from 'date-fns'
import { BellRing, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { IconButton } from '../../components/ui/Button'
import { useHousehold, useMembers } from '../../household/useHousehold'
import { getPushStatus } from '../../pwa/push'
import { useNow } from '../reminders/useNow'
import { BillsCard, FilesCard, GuestsCard, NotesCard, RemindersCard, TodayCard } from './cards'
import { greeting } from './summary'

const NUDGE_KEY = 'roommate-hub:hide-notify-nudge'

function NotifyNudge() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let hidden = false
    try {
      hidden = localStorage.getItem(NUDGE_KEY) === '1'
    } catch {
      // Storage blocked: show the nudge.
    }
    if (hidden) return
    void getPushStatus().then((s) => setShow(s === 'off' || s === 'needs-install'))
  }, [])
  if (!show) return null
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-accent-soft py-2 pr-2 pl-4 text-accent">
      <BellRing className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        Get a notification when a reminder or bill is due.{' '}
        <Link to="/settings" className="font-semibold underline underline-offset-2">
          Turn on notifications
        </Link>
      </p>
      <IconButton
        label="Hide this tip"
        onClick={() => {
          setShow(false)
          try {
            localStorage.setItem(NUDGE_KEY, '1')
          } catch {
            // Fine: it just shows again next visit.
          }
        }}
      >
        <X className="size-4" />
      </IconButton>
    </div>
  )
}

export default function HomePage() {
  const now = useNow()
  const { me } = useMembers()
  const { data: household } = useHousehold()

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-muted">
          {format(now, 'EEEE, MMMM d')}
          {household ? ` · ${household.name}` : ''}
        </p>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
          {greeting(now)}
          {me ? `, ${me.display_name}` : ''}
        </h1>
      </header>
      <NotifyNudge />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TodayCard now={now} />
        <RemindersCard now={now} />
        <GuestsCard now={now} />
        <BillsCard now={now} />
        <NotesCard />
        <FilesCard />
      </div>
    </div>
  )
}
