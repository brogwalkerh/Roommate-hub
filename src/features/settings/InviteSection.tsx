import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Share2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/Field'
import { Panel, SectionLabel } from '../../components/ui/Layout'
import { useToast } from '../../components/ui/Toast'
import { useMembers } from '../../household/useHousehold'
import { config } from '../../lib/config'
import { friendlyError, unwrap } from '../../lib/errors'
import { qk } from '../../lib/queryClient'
import { supabase } from '../../lib/supabase'

type Invite = { email: string; code: string }

/** The text to send the roommate. */
export function inviteMessage({ email, code }: Invite, appUrl: string = config.appUrl): string {
  return [
    `Join me on Roommate Hub: ${appUrl}`,
    '',
    '1. Tap “Create account”',
    `2. Use the email ${email}`,
    `3. Invite code: ${code}`,
    '',
    'The code works once. Afterwards, add the site to your Home Screen so notifications work.',
  ].join('\n')
}

function usePendingInvites(enabled: boolean) {
  return useQuery({
    queryKey: qk.invites,
    queryFn: async () => unwrap(await supabase.rpc('pending_invites')) ?? [],
    enabled,
  })
}

/** Invite the second household member: make a one-time code and share it. */
export function InviteSection() {
  const { me, roommate, isLoading } = useMembers()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [invite, setInvite] = useState<Invite | null>(null)
  const pending = usePendingInvites(!!me && !roommate)

  const create = useMutation({
    mutationFn: async (address: string) => {
      const code = unwrap(await supabase.rpc('create_invite', { p_email: address }))
      if (!code) throw new Error('server_error')
      return { email: address.trim().toLowerCase(), code }
    },
    onSuccess: (made) => {
      setInvite(made)
      setEmail('')
      void queryClient.invalidateQueries({ queryKey: qk.invites })
    },
    onError: (err) => toast(friendlyError(err), { tone: 'error' }),
  })
  const revoke = useMutation({
    mutationFn: async (address: string) => unwrap(await supabase.rpc('revoke_invite', { p_email: address })),
    onSuccess: (_v, address) => {
      if (invite?.email === address) setInvite(null)
      void queryClient.invalidateQueries({ queryKey: qk.invites })
      toast('Invite cancelled')
    },
    onError: (err) => toast(friendlyError(err), { tone: 'error' }),
  })

  if (isLoading || !me) return null

  return (
    <section className="flex flex-col gap-3" aria-labelledby="invite-heading">
      <SectionLabel>
        <span id="invite-heading">Your roommate</span>
      </SectionLabel>
      <Panel className="flex flex-col gap-4 p-4">
        {roommate ? (
          <p className="flex items-center gap-2 text-muted">
            <Check aria-hidden className="size-5 text-accent" />
            {roommate.display_name} has joined. You’re both set.
          </p>
        ) : invite ? (
          <InviteCard invite={invite} onCancel={() => revoke.mutate(invite.email)} cancelling={revoke.isPending} />
        ) : (
          <>
            {(pending.data ?? []).map((address) => (
              <div key={address} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-surface-2 p-3">
                <p className="mr-auto min-w-0">
                  <span className="block text-sm text-muted">Invite waiting for</span>
                  <span className="block font-medium break-all">{address}</span>
                </p>
                <Button size="sm" loading={create.isPending} onClick={() => create.mutate(address)}>
                  New code
                </Button>
                <Button size="sm" variant="ghost" loading={revoke.isPending} onClick={() => revoke.mutate(address)}>
                  Cancel
                </Button>
              </div>
            ))}
            <p className="text-muted">
              {pending.data?.length
                ? 'Lost the code? Make a new one; the old one stops working.'
                : 'Roommate Hub is for the two of you. Enter their email to make a one-time invite code.'}
            </p>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                if (email.trim()) create.mutate(email)
              }}
            >
              <div className="flex-1">
                <TextField
                  label="Their email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sam@example.com"
                />
              </div>
              <Button type="submit" variant="primary" icon={<UserPlus className="size-4" />} loading={create.isPending} disabled={!email.trim()}>
                Create invite
              </Button>
            </form>
          </>
        )}
      </Panel>
    </section>
  )
}

function InviteCard({ invite, onCancel, cancelling }: { invite: Invite; onCancel: () => void; cancelling: boolean }) {
  const { toast } = useToast()
  const message = inviteMessage(invite)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      toast('Message copied. Paste it in a text to your roommate.')
    } catch {
      toast('Couldn’t copy. Select the message and copy it by hand.', { tone: 'error' })
    }
  }

  async function share() {
    try {
      await navigator.share({ text: message })
    } catch {
      // Closed the share sheet: nothing to do.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p>
        Invite for <span className="font-medium break-all">{invite.email}</span>
      </p>
      <p className="rounded-xl bg-accent-soft px-4 py-3 text-center font-mono text-xl font-semibold tracking-wider text-accent">
        {invite.code}
      </p>
      <p className="text-sm text-muted">
        This code is shown only once and works only with that email. Send them the message below; it has everything they
        need.
      </p>
      <textarea
        readOnly
        aria-label="Message to send"
        value={message}
        rows={7}
        className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <Button variant="primary" icon={<Share2 className="size-4" />} onClick={() => void share()}>
            Share…
          </Button>
        )}
        <Button variant={canShare ? 'secondary' : 'primary'} icon={<Copy className="size-4" />} onClick={() => void copy()}>
          Copy message
        </Button>
        <Button variant="ghost" className="ml-auto text-danger" loading={cancelling} onClick={onCancel}>
          Cancel invite
        </Button>
      </div>
    </div>
  )
}
