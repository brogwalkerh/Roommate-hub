import {
  CalendarDays,
  FolderOpen,
  House,
  ListChecks,
  NotebookPen,
  Receipt,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; inTabBar: boolean }

/** Every section of the app. Items with inTabBar show in the phone tab bar; the rest live under More. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: House, inTabBar: true },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays, inTabBar: true },
  { to: '/reminders', label: 'Reminders', icon: ListChecks, inTabBar: true },
  { to: '/bills', label: 'Bills', icon: Receipt, inTabBar: true },
  { to: '/notes', label: 'Notes', icon: NotebookPen, inTabBar: false },
  { to: '/files', label: 'Files', icon: FolderOpen, inTabBar: false },
  { to: '/settings', label: 'Settings', icon: Settings, inTabBar: false },
]
