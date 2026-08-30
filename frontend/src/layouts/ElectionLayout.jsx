import { useParams, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Users, BarChart3, MapPin,
} from 'lucide-react'
import AppShell from '@/layouts/AppShell'
import ModuleStageLayout from '@/components/ui/ModuleStageLayout'

// Grouped into Setup → Results so the sidebar follows the workflow order,
// matching the Competition module's grouped layout. Routes are unchanged.
const BASE = '/organizer/election/events'
const navItems = [
  { label: 'Dashboard', path: '/organizer/election', icon: LayoutDashboard },
  { label: 'Events', path: '/organizer/election/events', icon: CalendarDays },

  { section: 'Setup' },
  { label: 'Positions', path: 'positions', icon: MapPin, scoped: true, basePath: BASE },
  { label: 'Candidates', path: 'candidates', icon: Users, scoped: true, basePath: BASE },
  { label: 'Voters', path: 'voters', icon: Users, scoped: true, basePath: BASE },

  { section: 'Results' },
  { label: 'Analytics', path: 'analytics', icon: BarChart3, scoped: true, basePath: BASE },
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
    >
<ModuleStageLayout module="election">
        <Outlet key={eventId || 'new'} />
      </ModuleStageLayout>
    </AppShell>
  )
}
