import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

const control =
  'w-full rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60 aria-[invalid=true]:border-danger'

type FieldShellProps = {
  id: string
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  hideLabel?: boolean
}

function FieldShell({ id, label, hint, error, children, hideLabel }: FieldShellProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-ink'}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type Common = { label: string; hint?: ReactNode; error?: string | null; hideLabel?: boolean }

export function TextField({ label, hint, error, hideLabel, id, className = '', ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <input
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`${control} h-11 ${className}`}
        {...rest}
      />
    </FieldShell>
  )
}

export function TextArea({ label, hint, error, hideLabel, id, className = '', ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <textarea
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`${control} min-h-24 py-2.5 ${className}`}
        {...rest}
      />
    </FieldShell>
  )
}

export function SelectField({
  label,
  hint,
  error,
  hideLabel,
  id,
  className = '',
  children,
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <select id={fieldId} aria-invalid={!!error} className={`${control} h-11 ${className}`} {...rest}>
        {children}
      </select>
    </FieldShell>
  )
}

export function Checkbox({ label, className = '', ...rest }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2.5 text-ink ${className}`}>
      <input type="checkbox" className="size-5 rounded accent-[var(--accent)]" {...rest} />
      <span>{label}</span>
    </label>
  )
}
