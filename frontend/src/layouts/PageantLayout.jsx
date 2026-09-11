import { useParams, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Users, Star, Award, Play, Settings2,
} from 'lucide-react'
import AppShell from '@/layouts/AppShell'
import ModuleStageLayout from '@/components/ui/ModuleStageLayout'

// Regrouped into Setup → Run → Results so the sidebar follows the actual
// workflow order. "Structure & Scoring" now holds rounds, criteria (with minor
// criteria + score types), divisions and scoring rules as tabs — so Criteria is
// no longer a separate sidebar item. Routes are otherwise unchanged.
const BASE = '/organizer/competition/events'
const navItems = [
  { label: 'Competition Scoring Dashboard', path: '/organizer/competition', icon: LayoutDashboard },
  { label: 'Competition Scoring Events', path: '/organizer/competition/events', icon: CalendarDays },

  { section: 'Setup' },
  { label: 'Structure & Scoring', path: 'workspace', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Contestants', path: 'contestants', icon: Users, scoped: true, basePath: BASE },
  { label: 'Judges', path: 'judges', icon: Star, scoped: true, basePath: BASE },

  { section: 'Run' },
  { label: 'Live Control', path: 'live', icon: Play, scoped: true, basePath: BASE },

  { section: 'Results' },
  { label: 'Rankings', path: 'rankings', icon: Award, scoped: true, basePath: BASE },
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
        <Outlet key={eventId || 'new'} />
      </ModuleStageLayout>
    </AppShell>
  )
}
