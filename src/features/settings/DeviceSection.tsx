import { Download, KeyRound, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Checkbox, TextField } from '../../components/ui/Field'
import { Panel, SectionLabel, Segmented } from '../../components/ui/Layout'
import { useToast } from '../../components/ui/Toast'
import { setDisplayPrefs, useDisplayPrefs, type EventLabelMode } from '../schedule/display'
import { friendlyError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { getStoredTheme, setTheme, type ThemeChoice } from '../../lib/theme'
import { useInstallPrompt } from '../../pwa/install'
import { isIos, isStandalone } from '../../pwa/push'
import { MIN_PASSWORD } from '../../auth/LoginPage'

export function AppearanceSection() {
  const [theme, setChoice] = useState<ThemeChoice>(getStoredTheme)
  const display = useDisplayPrefs()
  return (
    <section className="flex flex-col gap-3" aria-labelledby="appearance-heading">
      <SectionLabel>
        <span id="appearance-heading">Appearance</span>
      </SectionLabel>
      <Panel className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Theme on this device</span>
          <Segmented<ThemeChoice>
            label="Theme"
            value={theme}
            onChange={(t) => {
              setChoice(t)
              setTheme(t)
            }}
            options={[
              { value: 'system', label: 'Match device' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <span className="text-sm font-medium">Calendar colors</span>
          <Segmented<'bold' | 'soft'>
            label="Calendar colors"
            value={display.bold ? 'bold' : 'soft'}
            onChange={(v) => setDisplayPrefs({ bold: v === 'bold' })}
            options={[
              { value: 'bold', label: 'Bold' },
              { value: 'soft', label: 'Soft' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Calendar labels</span>
          <Segmented<EventLabelMode>
            label="Calendar labels"
            value={display.label}
            onChange={(label) => setDisplayPrefs({ label })}
            options={[
              { value: 'title', label: 'Work' },
              { value: 'initial', label: 'C Work' },
              { value: 'compact', label: 'C 6-230' },
            ]}
          />
          <p className="text-sm text-muted">
            The initial is the first letter of whose event it is. “C 6-230” shows the start and end times instead of the name.
          </p>
        </div>
        <Checkbox
          label="Compact calendar: square corners, smaller text, more events per day"
          checked={display.dense}
          onChange={(e) => setDisplayPrefs({ dense: e.target.checked })}
        />
      </Panel>
    </section>
  )
}

export function InstallSection() {
  const install = useInstallPrompt()
  if (isStandalone()) return null
  return (
    <section className="flex flex-col gap-3" aria-labelledby="install-heading">
      <SectionLabel>
        <span id="install-heading">Install the app</span>
      </SectionLabel>
      <Panel className="flex flex-col gap-3 p-4">
        {install ? (
          <>
            <p className="text-muted">Add Roommate Hub to this device so it opens like a regular app.</p>
            <div>
              <Button variant="primary" icon={<Download className="size-4" />} onClick={() => void install()}>
                Install
              </Button>
            </div>
          </>
        ) : isIos() ? (
          <p className="text-muted">
            In Safari, tap the Share button, then <strong className="text-ink">Add to Home Screen</strong>. Open the app from your
            Home Screen to turn on notifications.
          </p>
        ) : (
          <p className="text-muted">
            In your browser’s menu, choose <strong className="text-ink">Install app</strong> or{' '}
            <strong className="text-ink">Add to Home screen</strong>.
          </p>
        )}
      </Panel>
    </section>
  )
}

export function AccountSection() {
  const { user, signOut } = useAuth()
  const [changing, setChanging] = useState(false)
  return (
    <section className="flex flex-col gap-3" aria-labelledby="account-heading">
      <SectionLabel>
        <span id="account-heading">Account</span>
      </SectionLabel>
      <Panel className="flex flex-col gap-3 p-4">
        <p className="text-muted">
          Signed in as <span className="text-ink">{user?.email}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button icon={<KeyRound className="size-4" />} onClick={() => setChanging(true)}>
            Change password
          </Button>
          <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Panel>
      {changing && <ChangePasswordDialog onClose={() => setChanging(false)} />}
    </section>
  )
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  async function submit() {
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) toast(friendlyError(error), { tone: 'error' })
    else {
      toast('Password changed.')
      onClose()
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Change password"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={password.length < MIN_PASSWORD} onClick={() => void submit()}>
            Save password
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (password.length >= MIN_PASSWORD) void submit()
        }}
      >
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          hint={`At least ${MIN_PASSWORD} characters.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </form>
    </Dialog>
  )
}
