import { useParams } from 'react-router-dom'
import AppShell from '@/layouts/AppShell'

const navItems = [
  { label: 'Dashboard', path: '/organizer/election' },
  { label: 'Events', path: '/organizer/election/events' },
  {
    label: 'Positions',
    path: 'positions',
    scoped: true,
    basePath: '/organizer/election/events',
  },
  {
    label: 'Candidates',
    path: 'candidates',
    scoped: true,
    basePath: '/organizer/election/events',
  },
  {
    label: 'Voters',
    path: 'voters',
    scoped: true,
    basePath: '/organizer/election/events',
  },
  {
    label: 'Analytics',
    path: 'analytics',
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
