import { createContext, useContext, useMemo, type ComponentPropsWithoutRef, type JSX } from 'react'
import Markdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { findTaskLines } from './taskList'

// Raw HTML in a note is shown as plain text, never rendered (no rehype-raw), and
// react-markdown's default URL filter drops javascript: and similar links.

type PreviewContext = {
  /** Zero-based source line of every task item, in order (see taskList.ts). */
  taskLines: number[]
  onToggleTask?: (taskIndex: number) => void
}
const PreviewContext = createContext<PreviewContext>({ taskLines: [] })

/** Which task a list item is, and what to call its checkbox. -1 when the item can't be toggled. */
type TaskItem = { index: number; label: string }
const TaskContext = createContext<TaskItem | null>(null)

type Props<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> & ExtraProps

type HastNode = { type: string; value?: string; tagName?: string; children?: HastNode[] }

/** Text of a list item without its nested lists, for the checkbox's accessible name. */
function itemLabel(node: HastNode | undefined): string {
  const parts: string[] = []
  const walk = (n: HastNode) => {
    if (n.type === 'text') parts.push(n.value ?? '')
    else if (n.tagName !== 'ul' && n.tagName !== 'ol' && n.tagName !== 'input') n.children?.forEach(walk)
  }
  node?.children?.forEach(walk)
  return parts.join('').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function ListItem({ node, className, children }: Props<'li'>) {
  const { taskLines } = useContext(PreviewContext)
  if (!className?.split(' ').includes('task-list-item')) return <li className="my-1">{children}</li>

  // The list item's own source line says which task this is, so the mapping
  // holds even when the source has task-like text that isn't rendered.
  const line = node?.position?.start.line
  const index = line === undefined ? -1 : taskLines.indexOf(line - 1)
  return (
    <TaskContext.Provider value={{ index, label: itemLabel(node) }}>
      <li className="relative my-0 min-h-10 py-2 pl-10">{children}</li>
    </TaskContext.Provider>
  )
}

function TaskCheckbox({ checked }: Props<'input'>) {
  const { onToggleTask } = useContext(PreviewContext)
  const task = useContext(TaskContext)
  const canToggle = !!task && task.index >= 0 && !!onToggleTask
  return (
    // A 40px square around the 20px box keeps it easy to hit with a thumb.
    <span className="absolute top-0 left-0 flex size-10 items-center justify-center">
      <input
        type="checkbox"
        checked={!!checked}
        disabled={!canToggle}
        onChange={() => {
          if (task && onToggleTask) onToggleTask(task.index)
        }}
        aria-label={task?.label || 'Task'}
        className="size-5 cursor-pointer accent-[var(--accent)] disabled:cursor-default"
      />
    </span>
  )
}

const components: Components = {
  h1: ({ children }) => <h1 className="mt-6 mb-3 text-2xl font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 text-xl font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-2 text-lg font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-1 font-semibold">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-4 mb-1 font-semibold">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-4 mb-1 font-semibold text-muted">{children}</h6>,
  p: ({ children }) => <p className="my-3 leading-relaxed">{children}</p>,
  a: ({ href, children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline underline-offset-2 hover:text-accent-hover"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span> // the link was filtered out as unsafe
    ),
  ul: ({ className, children }) => (
    // [li_&]: lists nested in a list item sit tight against it.
    <ul className={`my-3 [li_&]:my-1 ${className?.includes('contains-task-list') ? 'list-none pl-0' : 'list-disc pl-6'}`}>{children}</ul>
  ),
  ol: ({ children }) => <ol className="my-3 list-decimal pl-6 [li_&]:my-1">{children}</ol>,
  li: ListItem,
  input: TaskCheckbox,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-4 border-line pl-4 text-muted">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-sm [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-6 border-line" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-line bg-surface-2 px-3 py-1.5 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-line px-3 py-1.5">{children}</td>,
  img: ({ src, alt }) => (
    <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" className="my-3 max-w-full rounded-lg" />
  ),
}

const remarkPlugins = [remarkGfm]

/**
 * A note's Markdown, rendered. Pass `onToggleTask` to make the checklist
 * checkboxes clickable; it receives the task's index for `toggleTaskInMarkdown`.
 */
export default function MarkdownPreview({
  source,
  onToggleTask,
}: {
  source: string
  onToggleTask?: (taskIndex: number) => void
}) {
  const taskLines = useMemo(() => findTaskLines(source), [source])
  const context = useMemo(() => ({ taskLines, onToggleTask }), [taskLines, onToggleTask])

  if (!source.trim()) return <p className="text-muted">Nothing to preview yet.</p>

  return (
    <PreviewContext.Provider value={context}>
      <div className="break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <Markdown remarkPlugins={remarkPlugins} components={components}>
          {source}
        </Markdown>
      </div>
    </PreviewContext.Provider>
  )
}
