import { filterNotes, noteSnippet, noteSnippetFor, noteTitle, sortNotes, stripMarkdown } from './noteText'

const note = (title: string, body: string) => ({ title, body })

describe('noteTitle', () => {
  it('uses the title when there is one', () => {
    expect(noteTitle(note('Groceries', '- milk'))).toBe('Groceries')
    expect(noteTitle(note('  Spaced  ', ''))).toBe('Spaced')
  })

  it('falls back to the first non-empty line of the body', () => {
    expect(noteTitle(note('', '\n\n  House rules  \nNo shoes inside'))).toBe('House rules')
    expect(noteTitle(note('   ', 'Wi-Fi password is on the fridge'))).toBe('Wi-Fi password is on the fridge')
  })

  it('strips Markdown from the borrowed line', () => {
    expect(noteTitle(note('', '# Grocery list\n- milk'))).toBe('Grocery list')
    expect(noteTitle(note('', '- [ ] buy **milk**'))).toBe('buy milk')
  })

  it('skips lines that are only syntax', () => {
    expect(noteTitle(note('', '---\n```\n\nReal text'))).toBe('Real text')
  })

  it('says "Untitled note" when there is nothing to use', () => {
    expect(noteTitle(note('', ''))).toBe('Untitled note')
    expect(noteTitle(note('  ', '\n  \n\t'))).toBe('Untitled note')
    expect(noteTitle(note('', '---'))).toBe('Untitled note')
  })

  it('caps a very long first line', () => {
    const title = noteTitle(note('', 'a'.repeat(500)))
    expect(Array.from(title)).toHaveLength(121)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('stripMarkdown', () => {
  it.each([
    ['# Heading', 'Heading'],
    ['###### Deep   heading', 'Deep heading'],
    ['**bold** and __bold__', 'bold and bold'],
    ['*italic* and _italic_', 'italic and italic'],
    ['~~gone~~', 'gone'],
    ['`code` here', 'code here'],
    ['[a link](https://example.com/x?y=1)', 'a link'],
    ['![a picture](pic.png)', 'a picture'],
    ['[ref link][1]', 'ref link'],
    ['<https://example.com>', 'https://example.com'],
    ['<b>html</b> text', 'html text'],
    ['> quoted\n> text', 'quoted text'],
    ['- one\n- two', 'one two'],
    ['* one\n+ two', 'one two'],
    ['1. one\n2) two', 'one two'],
    ['- [ ] todo\n- [x] done', 'todo done'],
    ['  - [X] nested', 'nested'],
    ['---\ntext\n***', 'text'],
    ['```js\nconst a = 1\n```', 'const a = 1'],
    ['| a | b |\n|---|---|\n| 1 | 2 |', 'a b 1 2'],
    ['line one\n\n\nline   two', 'line one line two'],
    ['snake_case_word and 5 * 3 * 2', 'snake_case_word and 5 * 3 * 2'],
    ['escaped \\*star\\* here', 'escaped *star* here'],
  ])('turns %j into %j', (input, expected) => {
    expect(stripMarkdown(input)).toBe(expected)
  })
})

describe('noteSnippet', () => {
  it('returns plain text for short bodies', () => {
    expect(noteSnippet('# Groceries\n\n- [ ] **milk**\n- [x] eggs')).toBe('Groceries milk eggs')
  })

  it('returns an empty string for an empty body', () => {
    expect(noteSnippet('')).toBe('')
    expect(noteSnippet('---\n\n')).toBe('')
  })

  it('cuts long text to about 100 characters with an ellipsis', () => {
    const snippet = noteSnippet('word '.repeat(100))
    expect(Array.from(snippet).length).toBeLessThanOrEqual(101)
    expect(Array.from(snippet).length).toBeGreaterThan(90)
    expect(snippet.endsWith('word…')).toBe(true)
  })

  it('does not add an ellipsis at exactly the limit', () => {
    expect(noteSnippet('a'.repeat(100))).toBe('a'.repeat(100))
    expect(noteSnippet('a'.repeat(101))).toBe(`${'a'.repeat(100)}…`)
  })

  it('does not split emoji', () => {
    const snippet = noteSnippet('🙂'.repeat(150))
    expect(snippet).toBe(`${'🙂'.repeat(100)}…`)
  })

  it('handles huge bodies quickly and still previews the start', () => {
    const body = `Start here\n${'x '.repeat(200_000)}`
    expect(noteSnippet(body).startsWith('Start here x x')).toBe(true)
  })
})

describe('noteSnippetFor', () => {
  it('previews the body when the note has a title', () => {
    expect(noteSnippetFor(note('Chores', 'Trash on Tuesday'))).toBe('Trash on Tuesday')
  })

  it('leaves out the line that became the title', () => {
    expect(noteSnippetFor(note('', '# Chores\nTrash on Tuesday\nDishes nightly'))).toBe('Trash on Tuesday Dishes nightly')
  })

  it('leaves out a first line that repeats the title', () => {
    expect(noteSnippetFor(note('House rules', '# House rules\n\n- Quiet after 10pm'))).toBe('Quiet after 10pm')
    expect(noteSnippetFor(note('chores', 'Chores\nTrash on Tuesday'))).toBe('Trash on Tuesday')
    expect(noteSnippetFor(note('Chores', 'Chores are shared\nTrash on Tuesday'))).toBe('Chores are shared Trash on Tuesday')
  })

  it('is empty for a one-line untitled note', () => {
    expect(noteSnippetFor(note('', 'Just one line'))).toBe('')
    expect(noteSnippetFor(note('', ''))).toBe('')
  })
})

describe('filterNotes', () => {
  const notes = [
    note('Groceries', '- milk\n- eggs'),
    note('House rules', 'No shoes inside.\nQuiet after 10pm.'),
    note('', 'Wi-Fi: HubNet'),
  ]

  it('returns everything for an empty or blank query', () => {
    expect(filterNotes(notes, '')).toEqual(notes)
    expect(filterNotes(notes, '   ')).toEqual(notes)
  })

  it('matches the title, ignoring case', () => {
    expect(filterNotes(notes, 'GROCER')).toEqual([notes[0]])
  })

  it('matches the body, ignoring case', () => {
    expect(filterNotes(notes, 'quiet after')).toEqual([notes[1]])
    expect(filterNotes(notes, 'hubnet')).toEqual([notes[2]])
  })

  it('requires every word, in any order and any field', () => {
    expect(filterNotes(notes, 'eggs groceries')).toEqual([notes[0]])
    expect(filterNotes(notes, 'milk rules')).toEqual([])
  })

  it('returns nothing when nothing matches and never mutates the input', () => {
    const copy = [...notes]
    expect(filterNotes(notes, 'zebra')).toEqual([])
    expect(notes).toEqual(copy)
  })
})

describe('sortNotes', () => {
  const n = (id: string, pinned: boolean, updated_at: string) => ({ id, pinned, updated_at })

  it('puts pinned notes first, then newest first', () => {
    const sorted = sortNotes([
      n('old', false, '2026-10-01T10:00:00+00:00'),
      n('new', false, '2026-10-10T10:00:00+00:00'),
      n('pin-old', true, '2026-09-01T10:00:00+00:00'),
      n('pin-new', true, '2026-10-05T10:00:00.5+00:00'),
    ])
    expect(sorted.map((x) => x.id)).toEqual(['pin-new', 'pin-old', 'new', 'old'])
  })

  it('orders by microseconds', () => {
    const sorted = sortNotes([n('a', false, '2026-10-01T10:00:00.000001+00:00'), n('b', false, '2026-10-01T10:00:00.000002+00:00')])
    expect(sorted.map((x) => x.id)).toEqual(['b', 'a'])
  })
})
