import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/Field'
import { Segmented } from '../components/ui/Layout'
import { config } from '../lib/config'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { AppMark } from '../layout/AppMark'

type Mode = 'signin' | 'signup' | 'forgot'

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const cleanEmail = email.trim().toLowerCase()
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        if (error) throw error
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Password should be at least 8 characters')
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: config.appUrl, data: { display_name: name.trim() } },
        })
        if (error) throw error
        if (!data.session) {
          setNotice(`We sent a confirmation link to ${cleanEmail}. Open it on this device, then sign in.`)
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: config.appUrl })
        if (error) throw error
        setNotice(`If ${cleanEmail} has an account, a reset link is on its way. Open it on this device.`)
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const submitLabel = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10 pt-safe">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <AppMark className="size-14" />
          <h1 className="text-3xl font-bold tracking-tight">Roommate Hub</h1>
          <p className="text-muted">Schedules, reminders, notes, bills and files for your place.</p>
        </div>

        {mode !== 'forgot' && (
          <div className="flex justify-center">
            <Segmented<Mode>
              label="Account"
              value={mode}
              onChange={(m) => {
                setMode(m)
                setError(null)
              }}
              options={[
                { value: 'signin', label: 'Sign in' },
                { value: 'signup', label: 'Create account' },
              ]}
            />
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
          {mode === 'forgot' && <h2 className="text-lg font-semibold">Reset your password</h2>}
          {mode === 'signup' && (
            <TextField
              label="Your name"
              hint="What your roommate sees, like “Sam”."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              required
              maxLength={40}
            />
          )}
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
          />
          {mode !== 'forgot' && (
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
              required
            />
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              {notice}
            </p>
          )}
          <Button type="submit" variant="primary" loading={busy}>
            {submitLabel}
          </Button>
          {mode === 'signin' && (
            <button type="button" className="text-sm text-muted underline underline-offset-2" onClick={() => setMode('forgot')}>
              Forgot your password?
            </button>
          )}
          {mode === 'forgot' && (
            <button type="button" className="text-sm text-muted underline underline-offset-2" onClick={() => setMode('signin')}>
              Back to sign in
            </button>
          )}
        </form>
        <p className="text-center text-sm text-muted">Only the two household emails can create an account.</p>
      </div>
    </main>
  )
}
