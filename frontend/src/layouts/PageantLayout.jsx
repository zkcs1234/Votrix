import { useParams, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Users, Star, ListChecks, Award, Play,
} from 'lucide-react'
import AppShell from '@/layouts/AppShell'
import ModuleStageLayout from '@/components/ui/ModuleStageLayout'

const navItems = [
  { label: 'Competition Scoring Dashboard', path: '/organizer/competition', icon: LayoutDashboard },
  { label: 'Competition Scoring Events', path: '/organizer/competition/events', icon: CalendarDays },
  {
    label: 'Contestants',
    path: 'contestants',
    icon: Users,
    scoped: true,
    basePath: '/organizer/competition/events',
  },
  {
    label: 'Criteria',
    path: 'criteria',
    icon: ListChecks,
    scoped: true,
    basePath: '/organizer/competition/events',
  },
  {
    label: 'Judges',
    path: 'judges',
    icon: Star,
    scoped: true,
    basePath: '/organizer/competition/events',
  },
  {
    label: 'Rankings',
    path: 'rankings',
    icon: Award,
    scoped: true,
    basePath: '/organizer/competition/events',
  },
  {
    label: 'Live Control',
    path: 'live',
    icon: Play,
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
    >
      <ModuleStageLayout module="competition">
        <Outlet />
      </ModuleStageLayout>
    </AppShell>
  )
}
