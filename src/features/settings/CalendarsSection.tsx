import { formatDistanceToNowStrict } from 'date-fns'
import { AlertTriangle, CalendarPlus, Home, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PersonChip } from '../../components/Person'
import { Button, IconButton } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { SelectField, TextField } from '../../components/ui/Field'
import { Panel, SectionLabel, Segmented } from '../../components/ui/Layout'
import { ErrorBlock, LoadingBlock } from '../../components/ui/Status'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { friendlyError } from '../../lib/errors'
import { useDeleteFeed, useFeeds, useSaveFeed, useSyncFeeds, validateFeedUrl, type Feed, type FeedInput } from './feeds'

const FEED_COLORS = ['#c2410c', '#2c5ea6', '#7a4fa3', '#0e7490', '#a16207', '#be185d']

export function CalendarsSection() {
  const feeds = useFeeds()
  const sync = useSyncFeeds()
  const { toast } = useToast()
  const [editing, setEditing] = useState<FeedInput | null>(null)

  async function syncAll() {
    try {
      const results = await sync.mutateAsync(undefined)
      const failed = results.filter((r) => !r.ok).length
      toast(failed ? `Synced, but ${failed} calendar${failed === 1 ? '' : 's'} had a problem.` : 'Calendars are up to date.', {
        tone: failed ? 'error' : 'default',
      })
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="calendars-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>
          <span id="calendars-heading">Connected calendars</span>
        </SectionLabel>
        {(feeds.data?.length ?? 0) > 0 && (
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} loading={sync.isPending} onClick={() => void syncAll()}>
            Sync now
          </Button>
        )}
      </div>
      <Panel className="divide-y divide-line">
        {feeds.isLoading && <LoadingBlock label="Loading calendars" />}
        {feeds.error && (
          <div className="p-4">
            <ErrorBlock error={feeds.error} onRetry={() => void feeds.refetch()} />
          </div>
        )}
        {feeds.data?.map((feed) => (
          <FeedRow key={feed.id} feed={feed} onEdit={() => setEditing(toInput(feed))} />
        ))}
        {feeds.data && feeds.data.length === 0 && (
          <p className="p-4 text-muted">
            Connect your Airbnb listing to see guest stays on the schedule. You can also add a personal calendar from
            Google, iCloud or Outlook.
          </p>
        )}
        <div className="flex flex-wrap gap-2 p-4">
          <Button
            variant="primary"
            icon={<Home className="size-4" />}
            onClick={() => setEditing({ name: 'Airbnb', kind: 'airbnb', url: '', color: FEED_COLORS[0], owner_id: null, privacy: 'details' })}
          >
            Add Airbnb calendar
          </Button>
          <Button
            icon={<CalendarPlus className="size-4" />}
            onClick={() => setEditing({ name: '', kind: 'ical', url: '', color: FEED_COLORS[1], owner_id: null, privacy: 'details' })}
          >
            Add personal calendar
          </Button>
        </div>
      </Panel>
      {editing && <FeedDialog initial={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function toInput(feed: Feed): FeedInput {
  return {
    id: feed.id,
    name: feed.name,
    kind: feed.kind,
    url: '',
    color: feed.color,
    owner_id: feed.owner_id,
    privacy: feed.privacy,
  }
}

function FeedRow({ feed, onEdit }: { feed: Feed; onEdit: () => void }) {
  const { byId } = useMembers()
  return (
    <button type="button" onClick={onEdit} className="flex w-full items-start gap-3 p-4 text-left hover:bg-surface-2">
      <span aria-hidden className="mt-1 size-3 shrink-0 rounded-full" style={{ background: feed.color }} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {feed.name}
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
            {feed.kind === 'airbnb' ? 'Airbnb' : feed.privacy === 'busy' ? 'Personal, busy only' : 'Personal'}
          </span>
        </span>
        {feed.kind === 'ical' && <PersonChip person={byId(feed.owner_id)} bothLabel="Household" />}
        <span className="truncate text-sm text-muted">{feed.url_hint}</span>
        {feed.last_error ? (
          <span className="flex items-start gap-1.5 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {feed.last_error}
          </span>
        ) : (
          <span className="text-sm text-muted">
            {feed.last_synced_at
              ? `Synced ${formatDistanceToNowStrict(new Date(feed.last_synced_at), { addSuffix: true })}`
              : 'Waiting for first sync'}
          </span>
        )}
      </span>
    </button>
  )
}

function FeedDialog({ initial, onClose }: { initial: FeedInput; onClose: () => void }) {
  const [form, setForm] = useState(initial)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const save = useSaveFeed()
  const remove = useDeleteFeed()
  const { toast } = useToast()
  const { me, roommate } = useMembers()
  const isAirbnb = form.kind === 'airbnb'
  const editing = !!form.id

  async function submit() {
    const problem = editing && !form.url.trim() ? null : validateFeedUrl(form.url, form.kind)
    setUrlError(problem)
    if (problem || !form.name.trim()) return
    try {
      await save.mutateAsync(form)
      toast(editing ? 'Calendar updated.' : 'Calendar connected. Syncing now.')
      onClose()
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    }
  }

  async function doDelete() {
    if (!form.id) return
    try {
      await remove.mutateAsync(form.id)
      toast('Calendar removed.')
      onClose()
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Edit calendar' : isAirbnb ? 'Connect Airbnb' : 'Add a personal calendar'}
      footer={
        confirmDelete ? (
          <>
            <span className="mr-auto self-center text-sm">Remove this calendar and its events?</span>
            <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => void doDelete()}>
              Remove
            </Button>
          </>
        ) : (
          <>
            {editing && (
              <IconButton label="Remove calendar" variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-5" />
              </IconButton>
            )}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => void submit()} disabled={!form.name.trim()}>
              {editing ? 'Save' : 'Connect'}
            </Button>
          </>
        )
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isAirbnb ? 'Spare room' : 'Work'} required maxLength={60} />
        <TextField
          label={editing ? 'Calendar link (leave empty to keep the current one)' : 'Calendar link'}
          value={form.url}
          onChange={(e) => {
            setForm({ ...form, url: e.target.value })
            setUrlError(null)
          }}
          placeholder={isAirbnb ? 'https://www.airbnb.com/calendar/ical/…' : 'https://… or webcal://…'}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          error={urlError}
          hint="The link stays private. Once saved, it can’t be viewed again, only replaced."
        />
        <details className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Where do I find this link?</summary>
          {isAirbnb ? (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
              <li>On airbnb.com (or the Airbnb app), open Calendar and pick the listing.</li>
              <li>Open Availability, then “Connect to another website” / “Sync calendars”.</li>
              <li>Choose Export calendar and copy the link. It ends in .ics.</li>
            </ol>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>Google Calendar (on a computer): Settings, pick the calendar, “Secret address in iCal format”.</li>
              <li>iCloud: in the Calendar app, share the calendar as a Public Calendar and copy the link.</li>
              <li>Outlook: Settings, Calendar, Shared calendars, Publish a calendar, copy the ICS link.</li>
            </ul>
          )}
        </details>
        {!isAirbnb && (
          <>
            <SelectField
              label="Whose calendar"
              value={form.owner_id ?? ''}
              onChange={(e) => setForm({ ...form, owner_id: e.target.value || null })}
            >
              {me && <option value={me.id}>{me.display_name} (you)</option>}
              {roommate && <option value={roommate.id}>{roommate.display_name}</option>}
              <option value="">Household</option>
            </SelectField>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">What your roommate sees</span>
              <Segmented
                label="What your roommate sees"
                value={form.privacy}
                onChange={(privacy) => setForm({ ...form, privacy })}
                options={[
                  { value: 'details', label: 'Event details' },
                  { value: 'busy', label: 'Just “Busy”' },
                ]}
              />
            </div>
          </>
        )}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Color</legend>
          <div className="flex flex-wrap gap-2">
            {FEED_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={form.color === c}
                onClick={() => setForm({ ...form, color: c })}
                className={`size-9 rounded-full border-2 ${form.color === c ? 'border-ink' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  )
}
