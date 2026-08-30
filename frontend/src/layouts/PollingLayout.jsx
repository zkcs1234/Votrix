import { useParams, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, PenSquare, Settings2, Users, BarChart3,
} from 'lucide-react'
import AppShell from '@/layouts/AppShell'
import ModuleStageLayout from '@/components/ui/ModuleStageLayout'

// Grouped into Setup → Results so the sidebar follows the workflow order,
// matching the Competition module's grouped layout. Routes are unchanged.
const BASE = '/organizer/polling/events'
const navItems = [
  { label: 'Dashboard', path: '/organizer/polling', icon: LayoutDashboard },
  { label: 'Polls', path: '/organizer/polling/events', icon: CalendarDays },

  { section: 'Setup' },
  { label: 'Builder', path: 'builder', icon: PenSquare, scoped: true, basePath: BASE },
  { label: 'Settings', path: 'settings', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Respondents', path: 'respondents', icon: Users, scoped: true, basePath: BASE },

  { section: 'Results' },
  { label: 'Analytics', path: 'analytics', icon: BarChart3, scoped: true, basePath: BASE },
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
    >
<ModuleStageLayout module="polling">
        <Outlet key={eventId || 'new'} />
      </ModuleStageLayout>
    </AppShell>
  )
}
