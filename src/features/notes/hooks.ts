import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { qk } from '../../lib/queryClient'
import { useRealtime } from '../../lib/useRealtime'
import { createNote, deleteNote, fetchNote, listNotes, saveNote, setNotePinned, type Note, type NoteContent } from './api'
import { sortNotes } from './noteText'

// The Home dashboard imports `Note`, `useNotes` and `usePinnedNotes` from here.
export type { Note } from './api'

// Every key starts with qk.notes so one realtime invalidation refreshes them all.
const listKey = [...qk.notes, 'list'] as const
const detailKey = (id: string) => [...qk.notes, 'detail', id] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A route like #/notes/abc isn't a note id; asking Postgres about it would error. */
export function isNoteId(value: string | undefined): value is string {
  return !!value && UUID.test(value)
}

const pinnedOnly = (notes: Note[]) => notes.filter((n) => n.pinned)

/** All notes, pinned first, then most recently edited. */
export function useNotes() {
  useRealtime('notes', qk.notes)
  return useQuery({ queryKey: listKey, queryFn: listNotes })
}

/** Only the pinned notes, most recently edited first. Shares one fetch with `useNotes`. */
export function usePinnedNotes() {
  useRealtime('notes', qk.notes)
  return useQuery({ queryKey: listKey, queryFn: listNotes, select: pinnedOnly })
}

/** One note. `data` is null when it doesn't exist (for example, your roommate deleted it). */
export function useNote(id: string | undefined) {
  const queryClient = useQueryClient()
  useRealtime('notes', qk.notes)
  return useQuery({
    queryKey: detailKey(id ?? ''),
    queryFn: () => fetchNote(id!),
    enabled: isNoteId(id),
    // Opening a note from the list shows it straight away from the list's copy.
    initialData: () => queryClient.getQueryData<Note[]>(listKey)?.find((n) => n.id === id),
    initialDataUpdatedAt: () => queryClient.getQueryState(listKey)?.dataUpdatedAt,
  })
}

/** Put a freshly saved or fetched row into the caches so the list and editor agree at once. */
export function cacheNote(queryClient: QueryClient, row: Note) {
  queryClient.setQueryData(detailKey(row.id), row)
  queryClient.setQueryData<Note[]>(listKey, (old) =>
    old ? sortNotes(old.some((n) => n.id === row.id) ? old.map((n) => (n.id === row.id ? row : n)) : [row, ...old]) : old,
  )
}

/** Creates an empty note and resolves to its id; the caller navigates to it. */
export function useCreateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const row = await createNote()
      cacheNote(queryClient, row)
      return row.id
    },
  })
}

/**
 * Save a note's text. With `base` (the `updated_at` you last loaded or saved) it
 * only applies if nobody saved in between and resolves to null when someone did;
 * without it, it overwrites. The editor does not use this: it drives its own
 * autosave through noteSync.ts, which handles the conflict cases.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, content, base }: { id: string; content: NoteContent; base: string | null }) => {
      const row = await saveNote(id, content, base)
      if (row) cacheNote(queryClient, row)
      return row
    },
  })
}

export function useTogglePin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const row = await setNotePinned(id, pinned)
      cacheNote(queryClient, row)
      return row
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteNote(id)
      queryClient.setQueryData<Note[]>(listKey, (old) => old?.filter((n) => n.id !== id))
      return id
    },
  })
}

/** Drop the cached detail for a deleted note. Call after navigating away from it. */
export function forgetNote(queryClient: QueryClient, id: string) {
  queryClient.removeQueries({ queryKey: detailKey(id) })
}
