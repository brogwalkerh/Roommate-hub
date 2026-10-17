import { FunctionsHttpError } from '@supabase/supabase-js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/Toast'
import { friendlyError, unwrap } from '../../../lib/errors'
import { qk } from '../../../lib/queryClient'
import { supabase } from '../../../lib/supabase'
import type { EventSaveFields } from '../eventForm'
import { overlapFilter, toDayWindow } from '../range'
import { parsedRange, rowsFromParsed, type ImportRow, type ParsedEvent } from './importRows'
import { readScheduleFile } from './readScheduleFile'

export type ParseInput = { file: File; today: string; weekOf: string }
export type ParseResult = { rows: ImportRow[]; warnings: string[] }

/** Error code from a failed function call (the JSON body's `error`), for friendlyError. */
async function functionErrorCode(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? 'server_error'
  }
  return error instanceof Error ? error.message : 'server_error'
}

/** Events already on the calendar around the parsed dates, to spot duplicates. */
async function existingEvents(events: ParsedEvent[]) {
  const range = parsedRange(events)
  if (!range) return []
  const win = toDayWindow(range)
  return (
    unwrap(await supabase.from('events').select('title, all_day, starts_at, start_date').or(overlapFilter(win))) ?? []
  )
}

/** Read the file, have parse-schedule list its events, and build the review rows. */
export function useParseSchedule() {
  return useMutation({
    mutationFn: async ({ file, today, weekOf }: ParseInput): Promise<ParseResult> => {
      const source = await readScheduleFile(file)
      const { data, error } = await supabase.functions.invoke<{ events: ParsedEvent[]; warnings: string[] }>(
        'parse-schedule',
        { body: { source, filename: file.name, today, week_of: weekOf } },
      )
      if (error) throw new Error(await functionErrorCode(error))
      const events = data?.events ?? []
      return { rows: rowsFromParsed(events, await existingEvents(events)), warnings: data?.warnings ?? [] }
    },
  })
}

/** Add the reviewed events in one insert. */
export function useImportEvents() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (fields: EventSaveFields[]) => {
      unwrap(await supabase.from('events').insert(fields))
      return fields.length
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: qk.events })
      toast(count === 1 ? 'Added 1 event' : `Added ${count} events`)
    },
    onError: (error) => toast(friendlyError(error), { tone: 'error' }),
  })
}
