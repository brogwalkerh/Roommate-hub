// GFM task list items ("- [ ] milk"), found and flipped in the raw Markdown
// source. The editor keeps the source as the single truth: ticking a checkbox
// in the preview edits the text, and autosave does the rest.

const FENCE = /^\s*(`{3,}|~{3,})(.*)$/
// Bullet (-, *, +) or number (1. or 1)), any indentation, then "[ ]" or "[x]"
// followed by text. GFM does not treat "[ ]" with nothing after it as a task.
const TASK = /^(\s*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=[ \t]+\S)/

/** Zero-based line numbers of every task item, skipping fenced code blocks. */
export function findTaskLines(source: string): number[] {
  const found: number[] = []
  let fence: { char: string; length: number } | null = null

  source.split('\n').forEach((raw, index) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const marker = FENCE.exec(line)

    if (fence) {
      const closes =
        marker && marker[1][0] === fence.char && marker[1].length >= fence.length && marker[2].trim() === ''
      if (closes) fence = null
      return
    }
    // A backtick fence cannot have backticks in its info string (that is inline code).
    if (marker && !(marker[1][0] === '`' && marker[2].includes('`'))) {
      fence = { char: marker[1][0], length: marker[1].length }
      return
    }
    if (TASK.test(line)) found.push(index)
  })

  return found
}

/**
 * Flip the Nth task item (zero-based, in document order) between "[ ]" and
 * "[x]". Returns the source unchanged when there is no such task.
 */
export function toggleTaskInMarkdown(source: string, taskIndex: number): string {
  const line = findTaskLines(source)[taskIndex]
  if (line === undefined) return source
  const lines = source.split('\n')
  lines[line] = lines[line].replace(TASK, (_match, prefix: string, mark: string) => `${prefix}[${mark === ' ' ? 'x' : ' '}]`)
  return lines.join('\n')
}
