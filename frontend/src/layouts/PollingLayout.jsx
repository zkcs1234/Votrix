import { useParams } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, PenSquare, Settings2, Users, BarChart3,
} from 'lucide-react'
import AppShell from '@/layouts/AppShell'

const navItems = [
  { label: 'Dashboard', path: '/organizer/polling', icon: LayoutDashboard },
  { label: 'Polls', path: '/organizer/polling/events', icon: CalendarDays },
  {
    label: 'Builder',
    path: 'builder',
    icon: PenSquare,
    scoped: true,
    basePath: '/organizer/polling/events',
  },
  {
    label: 'Settings',
    path: 'settings',
    icon: Settings2,
    scoped: true,
    basePath: '/organizer/polling/events',
  },
  {
    label: 'Respondents',
    path: 'respondents',
    icon: Users,
    scoped: true,
    basePath: '/organizer/polling/events',
  },
  {
    label: 'Analytics',
    path: 'analytics',
    icon: BarChart3,
    scoped: true,
    basePath: '/organizer/polling/events',
  },
]

export default function PollingLayout() {
  const { eventId } = useParams()

  return (
    <AppShell
      title="Polls & surveys"
      moduleLabel="Polling"
      homeLink="/organizer/polling"
      navItems={navItems}
      eventId={eventId}
      footerLink={{ to: '/organizer', label: '← Organizer home' }}
    />
  )
}
