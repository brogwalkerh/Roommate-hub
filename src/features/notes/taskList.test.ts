import { findTaskLines, toggleTaskInMarkdown } from './taskList'

describe('toggleTaskInMarkdown', () => {
  it('checks an unchecked task', () => {
    expect(toggleTaskInMarkdown('- [ ] milk', 0)).toBe('- [x] milk')
  })

  it('unchecks a checked task (lowercase and uppercase x)', () => {
    expect(toggleTaskInMarkdown('- [x] milk', 0)).toBe('- [ ] milk')
    expect(toggleTaskInMarkdown('- [X] milk', 0)).toBe('- [ ] milk')
  })

  it('flips only the Nth task', () => {
    const source = '- [ ] milk\n- [x] eggs\n- [ ] bread'
    expect(toggleTaskInMarkdown(source, 0)).toBe('- [x] milk\n- [x] eggs\n- [ ] bread')
    expect(toggleTaskInMarkdown(source, 1)).toBe('- [ ] milk\n- [ ] eggs\n- [ ] bread')
    expect(toggleTaskInMarkdown(source, 2)).toBe('- [ ] milk\n- [x] eggs\n- [x] bread')
  })

  it('handles *, + and numbered markers', () => {
    expect(toggleTaskInMarkdown('* [ ] a', 0)).toBe('* [x] a')
    expect(toggleTaskInMarkdown('+ [ ] a', 0)).toBe('+ [x] a')
    expect(toggleTaskInMarkdown('1. [ ] a', 0)).toBe('1. [x] a')
    expect(toggleTaskInMarkdown('12) [x] a', 0)).toBe('12) [ ] a')
  })

  it('handles any indentation, tabs included', () => {
    const source = '- [ ] parent\n  - [ ] child\n    - [x] grandchild\n\t- [ ] tabbed'
    expect(toggleTaskInMarkdown(source, 1)).toBe('- [ ] parent\n  - [x] child\n    - [x] grandchild\n\t- [ ] tabbed')
    expect(toggleTaskInMarkdown(source, 2)).toBe('- [ ] parent\n  - [ ] child\n    - [ ] grandchild\n\t- [ ] tabbed')
    expect(toggleTaskInMarkdown(source, 3)).toBe('- [ ] parent\n  - [ ] child\n    - [x] grandchild\n\t- [x] tabbed')
  })

  it('keeps the rest of the line and the rest of the text intact', () => {
    const source = '# List\n\nBuy:\n\n- [ ] **milk** and [eggs](https://example.com) [x]\n\nDone.\n'
    expect(toggleTaskInMarkdown(source, 0)).toBe(
      '# List\n\nBuy:\n\n- [x] **milk** and [eggs](https://example.com) [x]\n\nDone.\n',
    )
  })

  it('ignores task-like text inside fenced code blocks', () => {
    const source = ['- [ ] before', '```', '- [ ] in code', '```', '- [ ] after'].join('\n')
    expect(toggleTaskInMarkdown(source, 1)).toBe(['- [ ] before', '```', '- [ ] in code', '```', '- [x] after'].join('\n'))
  })

  it('ignores tasks inside tilde fences and longer fences', () => {
    const source = ['~~~', '- [ ] a', '~~~', '````md', '```', '- [ ] b', '```', '````', '- [ ] c'].join('\n')
    expect(findTaskLines(source)).toEqual([8])
    expect(toggleTaskInMarkdown(source, 0).split('\n')[8]).toBe('- [x] c')
  })

  it('treats an unclosed fence as running to the end', () => {
    expect(findTaskLines('- [ ] a\n```\n- [ ] b')).toEqual([0])
  })

  it('does not close a fence with a different marker or a shorter one', () => {
    expect(findTaskLines('````\n```\n- [ ] still code\n~~~~\n````\n- [ ] real')).toEqual([5])
  })

  it('ignores indented fences just the same', () => {
    expect(findTaskLines('- item\n  ```\n  - [ ] code\n  ```\n  - [ ] real')).toEqual([4])
  })

  it('does not count look-alikes', () => {
    const source = ['- [] no space', '-[ ] no gap', '- [ ]', '- [ ]x', '- [y] other', '[ ] bare', 'text - [ ] inline', '- [ ] real'].join('\n')
    expect(findTaskLines(source)).toEqual([7])
  })

  it('returns the source unchanged for an index with no task', () => {
    const source = 'No tasks here\n- plain'
    expect(toggleTaskInMarkdown(source, 0)).toBe(source)
    expect(toggleTaskInMarkdown('- [ ] a', 1)).toBe('- [ ] a')
    expect(toggleTaskInMarkdown('- [ ] a', -1)).toBe('- [ ] a')
    expect(toggleTaskInMarkdown('- [ ] a', 0.5)).toBe('- [ ] a')
    expect(toggleTaskInMarkdown('', 0)).toBe('')
  })

  it('keeps Windows line endings', () => {
    expect(toggleTaskInMarkdown('- [ ] a\r\n- [ ] b\r\n', 1)).toBe('- [ ] a\r\n- [x] b\r\n')
    expect(findTaskLines('```\r\n- [ ] code\r\n```\r\n- [ ] real\r\n')).toEqual([3])
  })

  it('is its own inverse', () => {
    const source = '- [ ] a\n  1. [x] b\n* [ ] c'
    for (let i = 0; i < 3; i++) {
      expect(toggleTaskInMarkdown(toggleTaskInMarkdown(source, i), i)).toBe(source)
    }
  })
})
