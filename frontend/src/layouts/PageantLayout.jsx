import { useParams } from 'react-router-dom'
import AppShell from '@/layouts/AppShell'

const navItems = [
  { label: 'Dashboard', path: '/organizer/pageant' },
  { label: 'Events', path: '/organizer/pageant/events' },
  {
    label: 'Contestants',
    path: 'contestants',
    scoped: true,
    basePath: '/organizer/pageant/events',
  },
  {
    label: 'Criteria',
    path: 'criteria',
    scoped: true,
    basePath: '/organizer/pageant/events',
  },
  {
    label: 'Judges',
    path: 'judges',
    scoped: true,
    basePath: '/organizer/pageant/events',
  },
  {
    label: 'Rankings',
    path: 'rankings',
    scoped: true,
    basePath: '/organizer/pageant/events',
  },
]

export default function PageantLayout() {
  const { eventId } = useParams()

  return (
    <AppShell
      title="Pageant scoring"
      moduleLabel="Pageant"
      homeLink="/organizer/pageant"
      navItems={navItems}
      eventId={eventId}
      footerLink={{ to: '/organizer', label: '← Organizer home' }}
    />
  )
}
