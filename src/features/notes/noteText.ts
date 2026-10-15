// Pure text helpers for notes: titles, list previews, search and ordering.
// No React and no Supabase here, so the Home dashboard can import them cheaply.

import { compareTimestamps } from './timestamps'

type Titled = { title: string; body: string }

const UNTITLED = 'Untitled note'
const TITLE_MAX = 120
/** Longest stretch of a note body that title and preview scanning will look at. */
const SCAN_CHARS = 1500

const ESCAPED = /\\([\\`*_{}[\]()#+\-.!|>~])/g
/** Private-use code points standing in for escaped characters while syntax is stripped. */
const PARKED = 0xe000
const PARKED_CHAR = /[\ue000-\ue07f]/g

/** Plain text for one or more lines of Markdown: syntax removed, whitespace collapsed. */
export function stripMarkdown(text: string): string {
  return (
    text
      // Escaped punctuation (a backslash then a symbol) is literal text: park it out of the way, then restore it.
      .replace(ESCAPED, (_match, char: string) => String.fromCharCode(PARKED + char.charCodeAt(0)))
      .replace(/^[ \t]*(?:`{3,}|~{3,}).*$/gm, '') // code fence lines
      .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '') // horizontal rules
      .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, '') // table dividers
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '') // headings
      .replace(/^[ \t]*(?:>[ \t]?)+/gm, '') // block quotes
      .replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '') // list and task markers
      .replace(/^[ \t]*\|.*$/gm, (row) => row.replace(/\|/g, ' ')) // table rows
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images keep their alt text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links keep their label
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1') // reference links
      .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, '$1') // <https://autolinks>
      .replace(/<\/?[a-zA-Z][^<>]*>/g, '') // HTML tags
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2') // bold
      .replace(/\*(?=\S)([^*]*?\S)\*/g, '$1') // italic with *
      .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1$2') // italic with _
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1') // strikethrough
      .replace(/`+([^`]+?)`+/g, '$1') // inline code
      .replace(/\s+/g, ' ')
      .trim()
      .replace(PARKED_CHAR, (char) => String.fromCharCode(char.charCodeAt(0) - PARKED))
  )
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : `${chars.slice(0, max).join('').trimEnd()}…`
}

/** First line of the body that has text once Markdown is stripped, plus everything after it. */
function firstTextLine(body: string): { text: string; rest: string } | null {
  let start = 0
  for (let n = 0; n < 50 && start <= body.length; n++) {
    let end = body.indexOf('\n', start)
    if (end === -1) end = body.length
    const text = stripMarkdown(body.slice(start, Math.min(end, start + SCAN_CHARS)))
    if (text) return { text, rest: body.slice(end + 1) }
    if (end >= body.length) break
    start = end + 1
  }
  return null
}

/** The note's title, or its first line of text, or "Untitled note". */
export function noteTitle(note: Titled): string {
  const title = note.title.trim()
  if (title) return title
  const line = firstTextLine(note.body)
  return line ? truncate(line.text, TITLE_MAX) : UNTITLED
}

/** A one-line preview of Markdown text, about 100 characters, with the syntax stripped. */
export function noteSnippet(body: string, max = 100): string {
  return truncate(stripMarkdown(body.slice(0, SCAN_CHARS)), max)
}

/**
 * The preview to show under a note's title in a list. When the title is
 * borrowed from the first line of the body, or the body opens by repeating the
 * title, that line is left out so the preview does not say it twice.
 */
export function noteSnippetFor(note: Titled, max = 100): string {
  const title = note.title.trim()
  const first = firstTextLine(note.body)
  // The first line is the title already when it is borrowed, or when it repeats the title ("# Chores" under "Chores").
  const repeatsTitle = !title || first?.text.toLowerCase() === title.toLowerCase()
  return noteSnippet(repeatsTitle ? (first?.rest ?? '') : note.body, max)
}

/**
 * Notes whose title or body contains every word of the query, ignoring case.
 * An empty query returns the notes unchanged.
 */
export function filterNotes<T extends Titled>(notes: readonly T[], query: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...notes]
  return notes.filter((note) => {
    const haystack = `${note.title}\n${note.body}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

/** Pinned notes first, then the most recently edited first. Matches the list query's order. */
export function sortNotes<T extends { pinned: boolean; updated_at: string }>(notes: readonly T[]): T[] {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || compareTimestamps(b.updated_at, a.updated_at),
  )
}
