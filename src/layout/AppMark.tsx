/** The app's mark: a house with two windows, one for each roommate. */
export function AppMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <path d="M32 13 12 29v22h40V29L32 13Z" fill="var(--accent-ink)" />
      <rect x="20" y="34" width="9" height="9" rx="2" fill="#2c5ea6" />
      <rect x="35" y="34" width="9" height="9" rx="2" fill="#b0452f" />
    </svg>
  )
}
