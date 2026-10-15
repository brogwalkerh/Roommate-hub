import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import MarkdownPreview from './MarkdownPreview'
import { toggleTaskInMarkdown } from './taskList'

describe('MarkdownPreview', () => {
  it('renders Markdown with GFM extras', () => {
    render(
      <MarkdownPreview
        source={['# Title', '', 'Some **bold** and ~~struck~~ text.', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', '- one', '- two'].join('\n')}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('struck').tagName).toBe('DEL')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('opens links in a new tab without leaking the opener', () => {
    render(<MarkdownPreview source="See [the wiki](https://example.com/wiki) and https://example.org/auto" />)
    for (const name of ['the wiki', 'https://example.org/auto']) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(screen.getByRole('link', { name: 'the wiki' })).toHaveAttribute('href', 'https://example.com/wiki')
  })

  it('does not turn unsafe links into anything clickable', () => {
    render(<MarkdownPreview source="[click me](javascript:alert(1))" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('click me')).toBeInTheDocument()
  })

  it('shows raw HTML as text instead of rendering it', () => {
    const { container } = render(<MarkdownPreview source={'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<b>bold?</b>'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<b>bold?</b>')
  })

  it('says so when there is nothing to preview', () => {
    render(<MarkdownPreview source={'  \n '} />)
    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument()
  })

  describe('task lists', () => {
    const source = ['- [ ] milk', '- [x] eggs', '', '```', '- [ ] not a task', '```', '', '1. [ ] bread', '   - [ ] nested rye'].join('\n')

    it('shows checkboxes with their state and the item text as their name', () => {
      render(<MarkdownPreview source={source} onToggleTask={() => {}} />)
      const boxes = screen.getAllByRole('checkbox')
      expect(boxes).toHaveLength(4)
      expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([false, true, false, false])
      expect(screen.getByRole('checkbox', { name: 'milk' })).toBeEnabled()
      expect(screen.getByRole('checkbox', { name: 'bread' })).toBeInTheDocument() // not "bread nested rye"
      expect(screen.getByRole('checkbox', { name: 'nested rye' })).toBeInTheDocument()
    })

    it('reports the clicked task by its index among real tasks, skipping code blocks', () => {
      const onToggleTask = vi.fn()
      render(<MarkdownPreview source={source} onToggleTask={onToggleTask} />)
      fireEvent.click(screen.getByRole('checkbox', { name: 'milk' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'eggs' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'bread' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'nested rye' }))
      expect(onToggleTask.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3])
    })

    it('flips the right line when wired to toggleTaskInMarkdown', () => {
      let current = source
      const { rerender } = render(<MarkdownPreview source={current} onToggleTask={(i) => (current = toggleTaskInMarkdown(current, i))} />)
      fireEvent.click(screen.getByRole('checkbox', { name: 'nested rye' }))
      expect(current).toBe(source.replace('   - [ ] nested rye', '   - [x] nested rye'))
      rerender(<MarkdownPreview source={current} onToggleTask={() => {}} />)
      expect(screen.getByRole('checkbox', { name: 'nested rye' })).toBeChecked()
    })

    it('keeps focus on the checkbox after it is toggled', () => {
      const Host = () => {
        const [text, setText] = useState('- [ ] milk\n- [ ] eggs')
        return <MarkdownPreview source={text} onToggleTask={(i) => setText((t) => toggleTaskInMarkdown(t, i))} />
      }
      render(<Host />)
      const box = screen.getByRole('checkbox', { name: 'eggs' })
      box.focus()
      fireEvent.click(box)
      expect(screen.getByRole('checkbox', { name: 'eggs' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'eggs' })).toBe(box)
      expect(document.activeElement).toBe(box)
    })

    it('leaves checkboxes read-only without a handler', () => {
      render(<MarkdownPreview source={source} />)
      for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled()
    })

    it('leaves checkboxes it cannot map back to the source disabled', () => {
      const onToggleTask = vi.fn()
      render(<MarkdownPreview source={'> - [ ] quoted task\n\n- [ ] plain task'} onToggleTask={onToggleTask} />)
      expect(screen.getByRole('checkbox', { name: 'quoted task' })).toBeDisabled()
      fireEvent.click(screen.getByRole('checkbox', { name: 'plain task' }))
      expect(onToggleTask).toHaveBeenCalledWith(0)
    })
  })
})
