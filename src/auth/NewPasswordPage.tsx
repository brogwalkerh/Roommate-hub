import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/Field'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

/** Shown after someone opens a password-reset link. */
export function NewPasswordPage() {
  const { finishRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(friendlyError(error))
    else finishRecovery()
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy}>
          Save password
        </Button>
      </form>
    </main>
  )
}
