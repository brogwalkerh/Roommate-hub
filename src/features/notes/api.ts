// Raw Supabase calls for notes. React-free so the autosave logic can be tested
// with these swapped out; hooks.ts wraps them in React Query.

import type { Tables } from '../../lib/database.types'
import { unwrap } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

export type Note = Tables<'notes'>

/** The part of a note you edit by typing. */
export type NoteContent = { title: string; body: string }

// supabase-js types `data` as nullable even after unwrap() has thrown on errors.
function required<T>(value: T | null): T {
  if (value === null) throw new Error('The server returned no data.')
  return value
}

/** Pinned first, then most recently edited. */
export async function listNotes(): Promise<Note[]> {
  return required(
    unwrap(
      await supabase
        .from('notes')
        .select('*')
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false }),
    ),
  )
}

/** One note, or null when it doesn't exist (deleted, or never was). */
export async function fetchNote(id: string): Promise<Note | null> {
  return unwrap(await supabase.from('notes').select('*').eq('id', id).maybeSingle())
}

export async function createNote(): Promise<Note> {
  return required(unwrap(await supabase.from('notes').insert({ title: '', body: '' }).select().single()))
}

/**
 * Save the note's text. With `base`, the update only applies if the row's
 * `updated_at` still equals it (nobody saved in between) and resolves to null
 * when it doesn't match. Without `base` it overwrites whatever is there.
 * `updated_at` is compared as the exact string the server sent: never round-trip
 * it through a Date, which would drop the microseconds.
 */
export async function saveNote(id: string, content: NoteContent, base: string | null): Promise<Note | null> {
  let query = supabase.from('notes').update({ title: content.title, body: content.body }).eq('id', id)
  if (base !== null) query = query.eq('updated_at', base)
  const rows = required(unwrap(await query.select()))
  return rows[0] ?? null
}

/** Pinning leaves updated_at alone (notes_touch only bumps it for title/body edits). */
export async function setNotePinned(id: string, pinned: boolean): Promise<Note> {
  return required(unwrap(await supabase.from('notes').update({ pinned }).eq('id', id).select().single()))
}

export async function deleteNote(id: string): Promise<void> {
  unwrap(await supabase.from('notes').delete().eq('id', id))
}
