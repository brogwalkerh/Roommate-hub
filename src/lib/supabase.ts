import { createClient } from '@supabase/supabase-js'
import { config } from './config'
import type { Database } from './database.types'

export const supabase = createClient<Database>(config.supabaseUrl, config.supabasePublishableKey, {
  auth: {
    // PKCE returns ?code= in the query string, which leaves our #/hash routes alone.
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const STORAGE_BUCKET = 'household'
