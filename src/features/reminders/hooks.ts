import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { useMemo } from 'react'
import { useToast } from '../../components/ui/Toast'
import type { TablesInsert, TablesUpdate } from '../../lib/database.types'
import { unwrap } from '../../lib/errors'
import { qk } from '../../lib/queryClient'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/useRealtime'
import { buildDoneItems, dueSoon, reminderError, type DoneItem, type Reminder } from './logic'
import { useNow } from './useNow'

export type { Reminder, RepeatRule } from './logic'

/** How far back the "Done" list reaches. */
export const RECENT_DAYS = 7

const OPEN_KEY = [...qk.reminders, 'open'] as const

/** `.single()` results are typed as possibly null; an empty one means the reminder is gone. */
function required<T>(row: T | null): T {
  if (row === null) throw new Error('reminder_not_found')
  return row
}

/** Open reminders (not completed), soonest first. */
export function useOpenReminders() {
  useRealtime('reminders', qk.reminders)
  return useQuery({
    queryKey: OPEN_KEY,
    queryFn: async (): Promise<Reminder[]> =>
      (unwrap(await supabase.from('reminders').select('*').is('completed_at', null).order('due_at', { ascending: true })) ??
        []),
  })
}

/** Overdue reminders plus those due within the next `hours`, soonest first. */
export function useDueSoonReminders(hours = 24) {
  const { data, isLoading, isError, error } = useOpenReminders()
  const now = useNow()
  const reminders = useMemo<Reminder[]>(() => dueSoon(data ?? [], now, hours), [data, now, hours])
  return { reminders, isLoading, isError, error }
}

/**
 * Reminders finished in the last `days` days, newest first: one-time reminders
 * marked done, plus each logged completion of a repeating reminder.
 * reminder_completions is not in the realtime publication, but every
 * completion also updates its reminder row, which is.
 */
export function useRecentlyDoneReminders(days = RECENT_DAYS) {
  useRealtime('reminders', qk.reminders)
  return useQuery({
    queryKey: [...qk.reminders, 'done', days],
    queryFn: async (): Promise<DoneItem[]> => {
      const since = subDays(new Date(), days).toISOString()
      const [finished, completions] = await Promise.all([
        supabase
          .from('reminders')
          .select('id, title, assignee_id, repeat, completed_at, completed_by')
          .not('completed_at', 'is', null)
          .gte('completed_at', since),
        supabase
          .from('reminder_completions')
          .select('id, reminder_id, completed_at, completed_by, reminders(title, assignee_id, repeat)')
          .gte('completed_at', since),
      ])
      return buildDoneItems(unwrap(finished) ?? [], unwrap(completions) ?? [])
    },
  })
}

export function useCreateReminder() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (input: TablesInsert<'reminders'>): Promise<Reminder> =>
      required(unwrap(await supabase.from('reminders').insert(input).select().single())),
    onError: (err) => toast(reminderError(err), { tone: 'error' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.reminders }),
  })
}

/** Editing due_at restarts the repeat schedule in the database (trigger); nothing extra to send. */
export function useUpdateReminder() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'reminders'> }): Promise<Reminder> =>
      required(unwrap(await supabase.from('reminders').update(patch).eq('id', id).select().single())),
    onError: (err) => toast(reminderError(err), { tone: 'error' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.reminders }),
  })
}

export function useDeleteReminder() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('reminders').delete().eq('id', id)),
    onError: (err) => toast(reminderError(err), { tone: 'error' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.reminders }),
  })
}

/** Undo the latest completion of a reminder (the reminder id). */
export function useUndoCompleteReminder() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('undo_complete_reminder', { p_id: id })),
    onError: (err) => toast(reminderError(err), { tone: 'error' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.reminders }),
  })
}

/**
 * Mark a reminder done; call `mutate(reminderId)`. Repeating reminders move to
 * their next due time. Shows a "Marked done" toast with an Undo action. The
 * reminder leaves the open list right away and comes back if the call fails.
 */
export function useCompleteReminder() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const undo = useUndoCompleteReminder()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('complete_reminder', { p_id: id })),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: OPEN_KEY })
      const previous = queryClient.getQueryData<Reminder[]>(OPEN_KEY)
      queryClient.setQueryData<Reminder[]>(OPEN_KEY, (rows) => rows?.filter((r) => r.id !== id))
      return { previous }
    },
    onError: (err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(OPEN_KEY, context.previous)
      toast(reminderError(err), { tone: 'error' })
    },
    onSuccess: (_row, id) => {
      toast('Marked done', { action: { label: 'Undo', onClick: () => undo.mutate(id) } })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.reminders }),
  })
}
