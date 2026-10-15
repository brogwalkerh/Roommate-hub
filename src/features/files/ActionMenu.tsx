import { EllipsisVertical } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type MenuItem = {
  label: string
  icon: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
}

/**
 * A "more actions" button with a small menu: arrow keys move, Esc and outside taps close,
 * and the menu opens upward when it would run into the bottom of the screen.
 * Position it with `className` (for example "absolute right-1 top-1").
 */
export function ActionMenu({ label, items, className = '' }: { label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    menuItems()[0]?.focus()

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (event.key === 'Tab') {
        setOpen(false)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const all = menuItems()
      const current = all.indexOf(document.activeElement as HTMLElement)
      const last = all.length - 1
      let next = current
      if (event.key === 'ArrowDown') next = current >= last ? 0 : current + 1
      if (event.key === 'ArrowUp') next = current <= 0 ? last : current - 1
      if (event.key === 'Home') next = 0
      if (event.key === 'End') next = last
      all[next]?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = () => {
    if (!open && triggerRef.current) {
      // Room for the menu (about 230px) plus the tab bar that covers the bottom on phones.
      setOpenUp(window.innerHeight - triggerRef.current.getBoundingClientRect().bottom < 320)
    }
    setOpen((value) => !value)
  }

  return (
    <div ref={wrapperRef} className={`${open ? 'z-20' : 'z-10'} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        className="inline-flex size-10 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface-2"
      >
        <EllipsisVertical aria-hidden className="size-5" />
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          className={`absolute right-0 min-w-44 rounded-xl border border-line bg-surface py-1 shadow-xl ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false)
                // Put focus back on the trigger first so a dialog opened next returns focus here.
                triggerRef.current?.focus()
                item.onSelect()
              }}
              className={`flex h-11 w-full items-center gap-3 px-3 text-left text-[0.95rem] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none ${item.tone === 'danger' ? 'text-danger' : 'text-ink'}`}
            >
              <span aria-hidden className="[&>svg]:size-[1.125rem]">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
