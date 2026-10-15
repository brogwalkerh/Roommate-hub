import { BellOff, BellRing, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Field'
import { Panel, SectionLabel } from '../../components/ui/Layout'
import { useToast } from '../../components/ui/Toast'
import { useMembers, useUpdateMyProfile } from '../../household/useHousehold'
import { friendlyError } from '../../lib/errors'
import { disablePush, enablePush, getPushStatus, sendTestNotification, type PushStatus } from '../../pwa/push'

const STATUS_TEXT: Record<PushStatus, string> = {
  unsupported: 'This browser can’t show notifications from web apps. Try Chrome, Edge, Firefox or Safari.',
  'needs-install': 'On iPhone and iPad, notifications work once the app is on your Home Screen. Tap Share, then Add to Home Screen, then open the app from there.',
  denied: 'Notifications are blocked for this app. Allow them in your browser or phone settings, then come back here.',
  off: 'Notifications are off on this device.',
  on: 'Notifications are on for this device.',
}

export function NotificationsSection() {
  const { me } = useMembers()
  const update = useUpdateMyProfile()
  const { toast } = useToast()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState<'toggle' | 'test' | null>(null)

  const refresh = useCallback(() => void getPushStatus().then(setStatus), [])
  useEffect(refresh, [refresh])

  async function toggle() {
    setBusy('toggle')
    try {
      if (status === 'on') {
        await disablePush()
        toast('Notifications turned off on this device.')
      } else {
        await enablePush()
        toast('Notifications turned on.')
      }
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    } finally {
      setBusy(null)
      refresh()
    }
  }

  async function test() {
    setBusy('test')
    try {
      await sendTestNotification()
      toast('Test sent. It should arrive in a few seconds.')
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function setPref(patch: { notify_reminders?: boolean; notify_bills?: boolean }) {
    try {
      await update.mutateAsync(patch)
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' })
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="notifications-heading">
      <SectionLabel>
        <span id="notifications-heading">Notifications</span>
      </SectionLabel>
      <Panel className="flex flex-col gap-4 p-4">
        <p className="text-muted">{status ? STATUS_TEXT[status] : 'Checking this device…'}</p>
        {(status === 'on' || status === 'off') && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={status === 'on' ? 'secondary' : 'primary'}
              icon={status === 'on' ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
              loading={busy === 'toggle'}
              onClick={() => void toggle()}
            >
              {status === 'on' ? 'Turn off on this device' : 'Turn on notifications'}
            </Button>
            {status === 'on' && (
              <Button icon={<Send className="size-4" />} loading={busy === 'test'} onClick={() => void test()}>
                Send a test
              </Button>
            )}
          </div>
        )}
        {me && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-sm font-medium">Notify me about</p>
            <Checkbox
              label="Reminders when they’re due, and guest check-ins and check-outs"
              checked={me.notify_reminders}
              onChange={(e) => void setPref({ notify_reminders: e.target.checked })}
            />
            <Checkbox label="Bills on the day they’re due" checked={me.notify_bills} onChange={(e) => void setPref({ notify_bills: e.target.checked })} />
            <p className="text-sm text-muted">These choices apply to all your devices.</p>
          </div>
        )}
      </Panel>
    </section>
  )
}
