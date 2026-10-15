import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useToast } from '../../components/ui/Toast'
import { fetchNote, saveNote, type Note } from './api'
import { cacheNote } from './hooks'
import { createNoteSync } from './noteSync'

/**
 * Editing state for one open note, with autosave (see noteSync.ts). Mount it
 * once per note, keyed by the note's id. Pass the latest server copy of the
 * note every render: changes from your roommate load silently when you have no
 * unsaved edits.
 */
export function useNoteEditor(note: Note) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [sync] = useState(() =>
    createNoteSync(note, {
      save: saveNote,
      fetch: fetchNote,
      onRow: (row) => cacheNote(queryClient, row),
    }),
  )
  const view = useSyncExternalStore(sync.subscribe, sync.getView)

  useEffect(() => {
    sync.setOnLostEdits(() => toast('Your last changes to this note weren’t saved.', { tone: 'error' }))
  }, [sync, toast])

  useEffect(() => {
    sync.observe(note)
  }, [sync, note])

  useEffect(() => {
    sync.start()
    const saveNow = () => void sync.flush()
    const saveIfHidden = () => {
      if (document.visibilityState === 'hidden') saveNow()
    }
    document.addEventListener('visibilitychange', saveIfHidden)
    window.addEventListener('pagehide', saveNow)
    window.addEventListener('online', saveNow)
    return () => {
      document.removeEventListener('visibilitychange', saveIfHidden)
      window.removeEventListener('pagehide', saveNow)
      window.removeEventListener('online', saveNow)
      sync.dispose()
    }
  }, [sync])

  return {
    draft: view.draft,
    state: view.state,
    conflict: view.conflict,
    gone: view.gone,
    setTitle: (title: string) => sync.edit({ title }),
    setBody: (body: string, options?: { immediate?: boolean }) => sync.edit({ body }, options),
    flush: () => void sync.flush(),
    keepMine: sync.keepMine,
    loadTheirs: sync.loadTheirs,
    abandon: sync.abandon,
  }
}
