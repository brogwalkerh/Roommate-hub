import { Ellipsis, LogOut } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { PersonDot } from '../components/Person'
import { LoadingBlock } from '../components/ui/Status'
import { useHousehold, useMembers } from '../household/useHousehold'
import { AppMark } from './AppMark'
import { NAV } from './nav'

export function AppLayout() {
  const { signOut } = useAuth()
  const { me } = useMembers()
  const { data: household } = useHousehold()
  const location = useLocation()
  const moreActive = NAV.some((n) => !n.inTabBar && location.pathname.startsWith(n.to)) || location.pathname === '/more'

  return (
    <div className="flex min-h-full">
      {/* Sidebar: tablets and desktops */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-2 pb-6">
          <AppMark className="size-9" />
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight font-bold">Roommate Hub</p>
            <p className="truncate text-sm text-muted">{household?.name ?? ' '}</p>
          </div>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors ${isActive ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-2'}`
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 border-t border-line px-2 pt-4">
          <PersonDot person={me} className="size-3" />
          <span className="min-w-0 flex-1 truncate text-sm">{me?.display_name ?? ''}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 md:px-8 md:pt-8 md:pb-12">
          <Suspense fallback={<LoadingBlock />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Tab bar: phones */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-safe backdrop-blur md:hidden"
      >
        {NAV.filter((n) => n.inTabBar).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[0.7rem] font-medium ${isActive ? 'text-accent' : 'text-muted'}`
            }
          >
            <Icon className="size-6" aria-hidden />
            {label}
          </NavLink>
        ))}
        <NavLink
          to="/more"
          className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[0.7rem] font-medium ${moreActive ? 'text-accent' : 'text-muted'}`}
        >
          <Ellipsis className="size-6" aria-hidden />
          More
        </NavLink>
      </nav>
    </div>
  )
}
