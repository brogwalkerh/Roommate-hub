import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Create an account through the create-account Edge Function, which checks the
 * invite code and creates the account already confirmed (no email needed),
 * then sign in. Throws an Error whose message is an error code for friendlyError.
 */
export async function createAccount(input: { email: string; password: string; displayName: string; inviteCode: string }) {
  const { error } = await supabase.functions.invoke('create-account', {
    body: {
      email: input.email,
      password: input.password,
      display_name: input.displayName,
      invite_code: input.inviteCode,
    },
  })
  if (error) {
    let code = 'server_error'
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null
      code = body?.error ?? code
    } else {
      code = error.message
    }
    throw new Error(code)
  }
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password })
  if (signInError) throw signInError
}
