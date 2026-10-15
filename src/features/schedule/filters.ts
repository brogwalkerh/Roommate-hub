import type { CalendarItem } from './types'

/**
 * Filter chips. A chip is identified by a key:
 * 'me' | 'roommate' | 'household' | 'stays' | 'blocked' | `feed:<feed id>`
 * We store the keys that are switched off, so a newly added feed shows up
 * without anyone turning it on.
 */
export type FilterKey = string

const STORAGE_KEY = 'roommate-hub:schedule-filters'

/** Blocked dates are noise most days, so they start hidden. */
export const DEFAULT_HIDDEN: readonly FilterKey[] = ['blocked']

export function feedFilterKey(feedId: string): FilterKey {
  return `feed:${feedId}`
}

/** Which chip controls an item. */
export function filterKeyFor(item: CalendarItem, meId: string | null): FilterKey {
  switch (item.kind) {
    case 'stay':
      return 'stays'
    case 'blocked':
      return 'blocked'
    case 'personal':
      return feedFilterKey(item.feedId)
    case 'event':
      if (item.ownerId === null) return 'household'
      return item.ownerId === meId ? 'me' : 'roommate'
  }
}

export function isItemVisible(item: CalendarItem, hidden: readonly FilterKey[], meId: string | null): boolean {
  return !hidden.includes(filterKeyFor(item, meId))
}

/** Switch a chip on or off. Returns a new list. */
export function toggleHidden(hidden: readonly FilterKey[], key: FilterKey): FilterKey[] {
  return hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
}

/** Read the remembered filters. Falls back to the defaults if storage is missing, blocked or corrupt. */
export function loadHidden(): FilterKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return [...DEFAULT_HIDDEN]
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'hidden' in parsed &&
      Array.isArray(parsed.hidden) &&
      parsed.hidden.every((k): k is string => typeof k === 'string')
    ) {
      return parsed.hidden
    }
  } catch {
    // Storage blocked or the value is not JSON: use the defaults.
  }
  return [...DEFAULT_HIDDEN]
}

export function saveHidden(hidden: readonly FilterKey[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hidden }))
  } catch {
    // Storage blocked (private mode): the choice lasts for this visit only.
  }
}
