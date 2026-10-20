import { useParams, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Users, Star, Award, Play, Settings2, Rocket, FileText, BarChart3,
  Table2, ListOrdered, History,
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
  { label: 'Event Details', path: 'edit', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Branding', path: 'branding', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Competition Type', path: 'type', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Competitions / Categories', path: 'categories', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Rounds & Scoring', path: 'workspace', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Contestants & Entries', path: 'contestants', icon: Users, scoped: true, basePath: BASE },
  { label: 'Judges', path: 'judges', icon: Star, scoped: true, basePath: BASE },
  { label: 'Review & Publish', path: 'review', icon: Rocket, scoped: true, basePath: BASE },

  { section: 'Run' },
  { label: 'Live Control', path: 'live', icon: Play, scoped: true, basePath: BASE },

  { section: 'Results & Reporting' },
  {
    label: 'Tabulation',
    icon: Award,
    scoped: true,
    basePath: BASE,
    children: [
      { label: 'Overview', path: 'tabulation/overview', icon: LayoutDashboard, scoped: true, basePath: BASE,
        isActive: (location, eventId) => [ `${BASE}/${eventId}/tabulation`, `${BASE}/${eventId}/tabulation/overview` ].includes(location.pathname) },
    ],
  },
  { label: 'Scoring', path: 'scoring', icon: Table2, scoped: true, basePath: BASE,
    isActive: (location, eventId) => location.pathname === `${BASE}/${eventId}/scoring` },
  { label: 'Results', path: 'results', icon: ListOrdered, scoped: true, basePath: BASE,
    isActive: (location, eventId) => location.pathname === `${BASE}/${eventId}/results` },
  { label: 'Round Advancement', path: 'advancement', icon: Rocket, scoped: true, basePath: BASE },
  { label: 'Audit Trail', path: 'audit', icon: History, scoped: true, basePath: BASE },
  { label: 'Results & Analysis', path: 'rankings', icon: Award, scoped: true, basePath: BASE },
  { label: 'Analytics', path: 'analytics', icon: BarChart3, scoped: true, basePath: BASE },
  { label: 'Report', path: 'report', icon: FileText, scoped: true, basePath: BASE },
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
