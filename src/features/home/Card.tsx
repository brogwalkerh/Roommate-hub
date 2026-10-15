import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** A dashboard tile: icon + title, a "See all" link, and content. */
export function Card({
  icon: Icon,
  title,
  to,
  linkLabel = 'See all',
  children,
  tone = 'default',
}: {
  icon: LucideIcon
  title: string
  to: string
  linkLabel?: string
  children: ReactNode
  tone?: 'default' | 'guest'
}) {
  return (
    <section
      aria-label={title}
      className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-4 ${tone === 'guest' ? 'border-guest/40 bg-guest-soft' : 'border-line bg-surface'}`}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className={`size-5 ${tone === 'guest' ? 'text-guest' : 'text-accent'}`} aria-hidden />
          {title}
        </h2>
        <Link to={to} className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-sm text-muted hover:text-ink">
          {linkLabel}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </header>
      {children}
    </section>
  )
}

/** Muted one-line message inside a card. */
export function CardNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>
}
