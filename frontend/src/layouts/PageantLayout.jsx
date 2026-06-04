import { useParams } from 'react-router-dom'
import AppShell from '@/layouts/AppShell'

const navItems = [
  { label: 'Competition Scoring Dashboard', path: '/organizer/competition' },
  { label: 'Competition Scoring Events', path: '/organizer/competition/events' },
  {
    label: 'Contestants',
    path: 'contestants',
    scoped: true,
    basePath: '/organizer/competition/events',
  },
  {
    label: 'Criteria',
    path: 'criteria',
    scoped: true,
    basePath: '/organizer/competition/events',
  },
  {
    label: 'Judges',
    path: 'judges',
    scoped: true,
    basePath: '/organizer/competition/events',
  },
  {
    label: 'Rankings',
    path: 'rankings',
    scoped: true,
    basePath: '/organizer/competition/events',
  },
]

export default function PageantLayout() {
  const { eventId } = useParams()

  return (
    <AppShell
      title="Competition Scoring"
      moduleLabel="Competition Scoring"
      homeLink="/organizer/competition"
      navItems={navItems}
      eventId={eventId}
      footerLink={{ to: '/organizer', label: '← Organizer home' }}
    />
  )
}
