import { PersonDot } from '../../components/Person'
import type { Profile } from '../../household/useHousehold'
import type { Note } from './api'
import { relativeTime } from './relativeTime'

/** Who is looking and how to find a person by id: `me` and `byId` from `useMembers()`. */
export type People = {
  me: Profile | null
  byId: (id: string | null | undefined) => Profile | null
}

/**
 * "● Edited by Sam · 3 minutes ago". Takes `people` instead of calling
 * `useMembers()` itself, because each call opens a realtime channel and the
 * list shows one of these per note.
 */
export function EditedBy({ note, people }: { note: Pick<Note, 'updated_by' | 'updated_at'>; people: People }) {
  const person = people.byId(note.updated_by)
  const name = person ? (person.id === people.me?.id ? 'you' : person.display_name) : 'someone'
  const when = relativeTime(note.updated_at)
  return (
    <span className="inline-flex items-center gap-1.5">
      {person && <PersonDot person={person} className="size-2" />}
      <span>
        Edited by {name}
        {when && ` · ${when}`}
      </span>
    </span>
  )
}
