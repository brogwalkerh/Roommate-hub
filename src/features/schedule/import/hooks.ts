import { FunctionsHttpError } from '@supabase/supabase-js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/Toast'
import { friendlyError, unwrap } from '../../../lib/errors'
import { qk } from '../../../lib/queryClient'
import { supabase } from '../../../lib/supabase'
import { overlapFilter, toDayWindow } from '../range'
import type { DateRange } from '../types'
import {
  daysRange,
  existingKeys,
  expandWeekly,
  isDuplicate,
  rowsFromParsed,
  rowsRange,
  rowToFields,
  type ImportRow,
  type ParsedEvent,
} from './importRows'
import { readScheduleFile } from './readScheduleFile'

export type ParseInput = { file: File; today: string; weekOf: string; person: string }
export type ParseResult = { rows: ImportRow[]; warnings: string[] }

/** Error code from a failed function call (the JSON body's `error`), for friendlyError. */
async function functionErrorCode(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? 'server_error'
  }
  return error instanceof Error ? error.message : 'server_error'
}

/** Events already on the calendar in a date range, to spot duplicates. */
async function existingEvents(range: DateRange | null) {
  if (!range) return []
  const win = toDayWindow(range)
  return (
    unwrap(await supabase.from('events').select('title, all_day, starts_at, start_date').or(overlapFilter(win))) ?? []
  )
}

/** Read the file, have parse-schedule list its events, and build the review rows. */
export function useParseSchedule() {
  return useMutation({
    mutationFn: async ({ file, today, weekOf, person }: ParseInput): Promise<ParseResult> => {
      const source = await readScheduleFile(file)
      const { data, error } = await supabase.functions.invoke<{ events: ParsedEvent[]; warnings: string[] }>(
        'parse-schedule',
        { body: { source, filename: file.name, today, week_of: weekOf, person: person.trim() || undefined } },
      )
      if (error) throw new Error(await functionErrorCode(error))
      const events = data?.events ?? []
      return { rows: rowsFromParsed(events, await existingEvents(daysRange(events))), warnings: data?.warnings ?? [] }
    },
  })
}

export type ImportInput = {
  rows: ImportRow[]
  ownerId: string | null
  /** Copy every row forward this often, up to and including `until`. */
  repeat: { everyWeeks: number; until: string } | null
}

/** Add the reviewed events (and their weekly copies) in one insert. */
export function useImportEvents() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async ({ rows, ownerId, repeat }: ImportInput) => {
      let all = repeat ? expandWeekly(rows, repeat.everyWeeks, repeat.until) : rows
      let skipped = 0
      if (repeat) {
        // The person saw the originals; copies that already exist are quietly left out.
        const taken = existingKeys(await existingEvents(rowsRange(all)))
        const before = all.length
        all = all.filter((r) => !r.generated || !isDuplicate(r, taken))
        skipped = before - all.length
      }
      if (all.length > 0) unwrap(await supabase.from('events').insert(all.map((r) => rowToFields(r, ownerId))))
      return { added: all.length, skipped }
    },
    onSuccess: ({ added, skipped }) => {
      void queryClient.invalidateQueries({ queryKey: qk.events })
      const main = added === 1 ? 'Added 1 event' : `Added ${added} events`
      toast(skipped > 0 ? `${main} (${skipped} already on the calendar)` : main)
    },
    onError: (error) => toast(friendlyError(error), { tone: 'error' }),
  })
}
