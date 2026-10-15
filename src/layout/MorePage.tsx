import { ChevronRight, LogOut } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/ui/Layout'
import { NAV } from './nav'

/** Phone-only menu for the sections that don't fit in the tab bar. */
export default function MorePage() {
  const { signOut } = useAuth()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="More" />
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {NAV.filter((n) => !n.inTabBar).map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
              <Icon className="size-5 text-accent" aria-hidden />
              <span className="flex-1 font-medium">{label}</span>
              <ChevronRight className="size-5 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2">
            <LogOut className="size-5 text-muted" aria-hidden />
            <span className="flex-1 font-medium">Sign out</span>
          </button>
        </li>
      </ul>
    </div>
  )
}
