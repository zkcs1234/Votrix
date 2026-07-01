import { useParams } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Trophy, Users, BarChart3, MapPin,
} from 'lucide-react'
import AppShell from '@/layouts/AppShell'

const navItems = [
  { label: 'Dashboard', path: '/organizer/election', icon: LayoutDashboard },
  { label: 'Events', path: '/organizer/election/events', icon: CalendarDays },
  {
    label: 'Positions',
    path: 'positions',
    icon: MapPin,
    scoped: true,
    basePath: '/organizer/election/events',
  },
  {
    label: 'Candidates',
    path: 'candidates',
    icon: Users,
    scoped: true,
    basePath: '/organizer/election/events',
  },
  {
    label: 'Voters',
    path: 'voters',
    icon: Users,
    scoped: true,
    basePath: '/organizer/election/events',
  },
  {
    label: 'Analytics',
    path: 'analytics',
    icon: BarChart3,
    scoped: true,
    basePath: '/organizer/election/events',
  },
]

export default function ElectionLayout() {
  const { eventId } = useParams()

  const items = navItems.map((item) =>
    item.path === '/organizer/election'
      ? { ...item, isActive: (loc) => loc.pathname === '/organizer/election' }
      : item,
  )

  return (
    <AppShell
      title="Election management"
      moduleLabel="Election"
      homeLink="/organizer/election"
      navItems={items}
      eventId={eventId}
      footerLink={{ to: '/organizer', label: '← Organizer home' }}
    />
  )
}
