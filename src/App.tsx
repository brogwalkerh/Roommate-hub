import { lazy } from 'react'
import { createHashRouter, Navigate, RouterProvider } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import { LoginPage } from './auth/LoginPage'
import { NewPasswordPage } from './auth/NewPasswordPage'
import { LoadingBlock } from './components/ui/Status'
import { AppLayout } from './layout/AppLayout'

// Each section loads on first visit, so the calendar library doesn't slow down Home.
const HomePage = lazy(() => import('./features/home/HomePage'))
const SchedulePage = lazy(() => import('./features/schedule/SchedulePage'))
const RemindersPage = lazy(() => import('./features/reminders/RemindersPage'))
const NotesPage = lazy(() => import('./features/notes/NotesPage'))
const BillsPage = lazy(() => import('./features/bills/BillsPage'))
const FilesPage = lazy(() => import('./features/files/FilesPage'))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'))
const MorePage = lazy(() => import('./layout/MorePage'))

// Hash routes (#/bills) because GitHub Pages can't rewrite unknown paths to index.html.
const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'schedule', element: <SchedulePage /> },
      { path: 'reminders', element: <RemindersPage /> },
      { path: 'notes', element: <NotesPage /> },
      { path: 'notes/:noteId', element: <NotesPage /> },
      { path: 'bills', element: <BillsPage /> },
      { path: 'files', element: <FilesPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  const { session, loading, recovering } = useAuth()
  if (loading) return <LoadingBlock label="Opening" />
  if (!session) return <LoginPage />
  if (recovering) return <NewPasswordPage />
  return <RouterProvider router={router} />
}
