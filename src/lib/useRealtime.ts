import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from './supabase'

/**
 * Re-fetch the given queries whenever a row in `table` changes, so the other
 * roommate's edits show up without a refresh. Call it once per page/hook that
 * reads the table; channels are shared per table and torn down on unmount.
 */
export function useRealtime(table: string, ...invalidate: QueryKey[]) {
  const queryClient = useQueryClient()
  const keys = JSON.stringify(invalidate)

  useEffect(() => {
    const queryKeys = JSON.parse(keys) as QueryKey[]
    const channel = supabase
      .channel(`rt:${table}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        for (const queryKey of queryKeys) {
          void queryClient.invalidateQueries({ queryKey })
        }
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, keys, queryClient])
}
