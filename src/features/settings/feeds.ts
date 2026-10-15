import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables } from '../../lib/database.types'
import { unwrap } from '../../lib/errors'
import { qk } from '../../lib/queryClient'
import { supabase } from '../../lib/supabase'

export type Feed = Tables<'calendar_feeds'>

// The url column is write-only for clients, so list the readable columns explicitly.
const FEED_COLUMNS = 'id, name, kind, url_hint, color, owner_id, privacy, last_synced_at, last_error, created_by, created_at'

export function useFeeds() {
  return useQuery({
    queryKey: qk.feeds,
    queryFn: async () =>
      unwrap(await supabase.from('calendar_feeds').select(FEED_COLUMNS).order('created_at', { ascending: true })) as Feed[],
  })
}

export type FeedInput = {
  id?: string
  name: string
  kind: Enums<'feed_kind'>
  /** Leave empty when editing to keep the saved link. */
  url: string
  color: string
  owner_id: string | null
  privacy: Enums<'feed_privacy'>
}

/** Check a pasted calendar link before saving. Returns an error sentence or null. */
export function validateFeedUrl(raw: string, kind: Enums<'feed_kind'>): string | null {
  const value = raw.trim()
  if (!value) return 'Paste the calendar link.'
  let url: URL
  try {
    url = new URL(value.replace(/^webcal:\/\//i, 'https://'))
  } catch {
    return 'That doesn’t look like a link. It should start with https:// or webcal://.'
  }
  if (url.protocol !== 'https:') return 'The link should start with https:// or webcal://.'
  if (kind === 'airbnb' && !/(^|\.)airbnb\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i.test(url.hostname)) {
    return 'That isn’t an Airbnb link. In Airbnb, open Calendar, then Availability, then Export calendar.'
  }
  return null
}

export function useSyncFeeds() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (feedId?: string) => {
      const { data, error } = await supabase.functions.invoke<{ results: { id: string; ok: boolean; error?: string }[] }>(
        'sync-calendars',
        { body: feedId ? { feedId } : {} },
      )
      if (error) throw error
      return data?.results ?? []
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.feeds })
      void queryClient.invalidateQueries({ queryKey: qk.feedEvents })
    },
  })
}

export function useSaveFeed() {
  const queryClient = useQueryClient()
  const sync = useSyncFeeds()
  return useMutation({
    mutationFn: async (input: FeedInput) => {
      const base = { name: input.name.trim(), color: input.color, owner_id: input.owner_id, privacy: input.privacy }
      const url = input.url.trim()
      if (input.id) {
        unwrap(
          await supabase
            .from('calendar_feeds')
            .update(url ? { ...base, url } : base)
            .eq('id', input.id),
        )
        return input.id
      }
      const row = unwrap(
        await supabase.from('calendar_feeds').insert({ ...base, kind: input.kind, url }).select('id').single(),
      )
      if (!row) throw new Error('The calendar wasn’t saved. Try again.')
      return row.id
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: qk.feeds })
      // Pull the calendar right away so it shows up without waiting for the 30-minute sync.
      sync.mutate(id)
    },
  })
}

export function useDeleteFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('calendar_feeds').delete().eq('id', id))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.feeds })
      void queryClient.invalidateQueries({ queryKey: qk.feedEvents })
    },
  })
}
