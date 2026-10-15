import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type Toast = {
  id: number
  message: string
  tone: 'default' | 'error'
  action?: { label: string; onClick: () => void }
}

type ToastApi = {
  toast: (message: string, options?: { action?: Toast['action']; tone?: Toast['tone'] }) => void
}

const ToastContext = createContext<ToastApi | null>(null)

// Older browsers (and jsdom in tests) lack popovers; there the region is a plain fixed element.
const supportsPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const toast = useCallback<ToastApi['toast']>(
    (message, options) => {
      const id = nextId.current++
      setToasts((all) => [...all.slice(-2), { id, message, tone: options?.tone ?? 'default', action: options?.action }])
      window.setTimeout(() => dismiss(id), options?.action ? 6000 : 3500)
    },
    [dismiss],
  )

  const api = useMemo(() => ({ toast }), [toast])

  // Toasts live in the browser's top layer (as a popover) so they show above open dialogs.
  // Re-showing on each change keeps them above any dialog opened since.
  const region = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = region.current
    if (!el || !supportsPopover) return
    const open = el.matches(':popover-open')
    if (open) el.hidePopover()
    if (toasts.length > 0) el.showPopover()
  }, [toasts])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={region}
        popover={supportsPopover ? 'manual' : undefined}
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-auto bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 m-0 flex h-auto w-auto flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4 md:bottom-6 [&:not(:popover-open)]:hidden"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${t.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-bg'}`}
          >
            <span className="text-sm">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="text-sm font-semibold underline underline-offset-2"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
