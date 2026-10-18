import { useSyncExternalStore } from 'react'
import type { CalendarItem } from './types'

/**
 * How calendar items look on this device. Stored like the theme: per device,
 * never synced. Defaults are the bold, roomy look.
 */
export type EventLabelMode = 'title' | 'initial' | 'compact'

export type DisplayPrefs = {
  /** Solid blocks in the person's color instead of a light tint. */
  bold: boolean
  /** What an item's chip says: "Work", "C Work" or "C 6-230". */
  label: EventLabelMode
  /** Square corners, less padding, smaller text. */
  dense: boolean
}

export const DEFAULT_DISPLAY: DisplayPrefs = { bold: true, label: 'title', dense: false }

const KEY = 'roommate-hub:calendar-display'
const LABELS: EventLabelMode[] = ['title', 'initial', 'compact']

function read(): DisplayPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof DisplayPrefs, unknown>>
    return {
      bold: typeof raw.bold === 'boolean' ? raw.bold : DEFAULT_DISPLAY.bold,
      label: LABELS.includes(raw.label as EventLabelMode) ? (raw.label as EventLabelMode) : DEFAULT_DISPLAY.label,
      dense: typeof raw.dense === 'boolean' ? raw.dense : DEFAULT_DISPLAY.dense,
    }
  } catch {
    return DEFAULT_DISPLAY
  }
}

let current: DisplayPrefs | null = null
const listeners = new Set<() => void>()

export function getDisplayPrefs(): DisplayPrefs {
  if (!current) current = read()
  return current
}

export function setDisplayPrefs(patch: Partial<DisplayPrefs>) {
  current = { ...getDisplayPrefs(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage blocked (private mode): the choice lasts for this visit only.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The current preferences; re-renders when they change anywhere in the app. */
export function useDisplayPrefs(): DisplayPrefs {
  return useSyncExternalStore(subscribe, getDisplayPrefs, () => DEFAULT_DISPLAY)
}

/** "6", "230", "1115": the hour and, when not on the hour, the minutes. No AM/PM. */
export function compactTime(d: Date): string {
  const hour = d.getHours() % 12 || 12
  const minutes = d.getMinutes()
  return minutes ? `${hour}${String(minutes).padStart(2, '0')}` : String(hour)
}

/** The first letter of a name, for the chip prefix; null for nobody / the household. */
export function initialOf(name: string | null | undefined): string | null {
  const first = name?.trim().charAt(0)
  return first ? first.toUpperCase() : null
}

/**
 * What an item's chip says. Guest stays and blocked dates keep their names:
 * they're not anyone's shift. All-day items keep their name in compact mode
 * because they have no times to show.
 */
export function eventLabel(item: Pick<CalendarItem, 'title' | 'kind' | 'allDay' | 'start' | 'end'>, mode: EventLabelMode, initial: string | null): string {
  if (mode === 'title' || item.kind === 'stay' || item.kind === 'blocked') return item.title
  const prefix = initial ? `${initial} ` : ''
  if (mode === 'initial' || item.allDay) return prefix + item.title
  const start = compactTime(item.start)
  const end = item.end.getTime() > item.start.getTime() ? `-${compactTime(item.end)}` : ''
  return `${prefix}${start}${end}`
}
