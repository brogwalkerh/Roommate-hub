import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import type { Tables, TablesUpdate } from '../lib/database.types'
import { unwrap } from '../lib/errors'
import { qk } from '../lib/queryClient'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'

export type Profile = Tables<'profiles'>
export type Household = Tables<'household'>

/** Both members of the household, plus shortcuts for "me" and "my roommate". */
export function useMembers() {
  const { user } = useAuth()
  useRealtime('profiles', qk.profiles)

  const query = useQuery({
    queryKey: qk.profiles,
    queryFn: async () =>
      unwrap(await supabase.from('profiles').select('*').order('created_at', { ascending: true })),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })

  const members = query.data ?? []
  const me = members.find((m) => m.id === user?.id) ?? null
  const roommate = members.find((m) => m.id !== user?.id) ?? null
  const byId = (id: string | null | undefined) => (id ? members.find((m) => m.id === id) ?? null : null)

  return { ...query, members, me, roommate, byId }
}

export function useHousehold() {
  const { user } = useAuth()
  useRealtime('household', qk.household)
  return useQuery({
    queryKey: qk.household,
    queryFn: async () => unwrap(await supabase.from('household').select('*').eq('id', 1).single()),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}

export function useUpdateHousehold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: TablesUpdate<'household'>) =>
      unwrap(await supabase.from('household').update(patch).eq('id', 1).select().single()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.household }),
  })
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (patch: TablesUpdate<'profiles'>) => {
      if (!user) throw new Error('Not signed in')
      return unwrap(await supabase.from('profiles').update(patch).eq('id', user.id).select().single())
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.profiles }),
  })
}
