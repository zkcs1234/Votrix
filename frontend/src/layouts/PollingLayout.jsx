import { useParams } from 'react-router-dom'
import AppShell from '@/layouts/AppShell'

const navItems = [
  { label: 'Dashboard', path: '/organizer/polling' },
  { label: 'Polls', path: '/organizer/polling/events' },
  {
    label: 'Builder',
    path: 'builder',
    scoped: true,
    basePath: '/organizer/polling/events',
  },
  {
    label: 'Settings',
    path: 'settings',
    scoped: true,
    basePath: '/organizer/polling/events',
  },
  {
    label: 'Respondents',
    path: 'respondents',
    scoped: true,
    basePath: '/organizer/polling/events',
  },
  {
    label: 'Analytics',
    path: 'analytics',
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
