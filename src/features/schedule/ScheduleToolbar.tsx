import type { CalendarController } from '@fullcalendar/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, IconButton } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import type { ViewKey } from './views'

const VIEW_OPTIONS: { value: ViewKey; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'agenda', label: 'Agenda' },
]

/**
 * Previous / next / today, the current range title and a view switcher.
 * Built by hand (not FullCalendar's toolbar) so the buttons are 40px targets
 * and the layout holds at 375px: title and arrows on one row, Today and the
 * view switcher on the next. From 640px up everything sits on one row.
 */
export function ScheduleToolbar({
  controller,
  title,
  view,
  onViewChange,
  loading,
}: {
  controller: CalendarController
  title: string
  view: ViewKey
  onViewChange: (view: ViewKey) => void
  loading: boolean
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex items-center justify-between gap-3 sm:contents">
        <div className="flex min-w-0 items-center gap-2 sm:flex-1 sm:basis-40">
          <h2 aria-live="polite" className="min-w-0 text-lg leading-snug font-semibold">
            {title || ' '}
          </h2>
          {loading && (
            <span role="status" className="inline-flex shrink-0 items-center text-muted">
              <Spinner className="size-4" />
              <span className="sr-only">Loading events</span>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:order-3">
          <IconButton label="Previous" variant="secondary" onClick={() => controller.prev()}>
            <ChevronLeft className="size-5" aria-hidden />
          </IconButton>
          <IconButton label="Next" variant="secondary" onClick={() => controller.next()}>
            <ChevronRight className="size-5" aria-hidden />
          </IconButton>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:contents">
        <Button className="sm:order-2" onClick={() => controller.today()}>
          Today
        </Button>

        <div
          role="radiogroup"
          aria-label="Calendar view"
          className="inline-grid grid-cols-3 rounded-lg border border-line bg-surface-2 p-0.5 sm:order-4"
        >
          {VIEW_OPTIONS.map((option) => {
            const active = option.value === view
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onViewChange(option.value)}
                className={`h-10 rounded-md px-3.5 text-sm font-medium transition-colors ${
                  active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
