import { useParams, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Users, Star, Award, Play, Settings2, Rocket, FileText, BarChart3,
  ClipboardList, Table2, SlidersHorizontal, ListOrdered, History,
} from 'lucide-react'
import AppShell from '@/layouts/AppShell'
import ModuleStageLayout from '@/components/ui/ModuleStageLayout'

// Regrouped into Setup → Run → Results so the sidebar follows the actual
// workflow order. "Structure & Scoring" now holds rounds, criteria (with minor
// criteria + score types), divisions and scoring rules as tabs — so Criteria is
// no longer a separate sidebar item. Routes are otherwise unchanged.
const BASE = '/organizer/competition/events'
const navItems = [
  { section: 'Overview' },
  { label: 'Dashboard', path: '/organizer/competition', icon: LayoutDashboard },
  { label: 'Events', path: '/organizer/competition/events', icon: CalendarDays },

  { section: 'Setup' },
  { label: 'Competition Type', path: 'type', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Competitions / Categories', path: 'categories', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Rounds & Scoring', path: 'workspace', icon: Settings2, scoped: true, basePath: BASE },
  { label: 'Contestants & Entries', path: 'contestants', icon: Users, scoped: true, basePath: BASE },
  { label: 'Judges', path: 'judges', icon: Star, scoped: true, basePath: BASE },
  { label: 'Review & Publish', path: 'review', icon: Rocket, scoped: true, basePath: BASE },

  { section: 'Run' },
  { label: 'Live Control', path: 'live', icon: Play, scoped: true, basePath: BASE },

  { section: 'Results' },
  {
    label: 'Tabulation',
    icon: Award,
    scoped: true,
    basePath: BASE,
    children: [
      { label: 'Overview', path: 'tabulation/overview', icon: LayoutDashboard, scoped: true, basePath: BASE },
      { label: 'Judge Submissions', path: 'tabulation/submissions', icon: ClipboardList, scoped: true, basePath: BASE },
      { label: 'Tabulation Matrix', path: 'tabulation/matrix', icon: Table2, scoped: true, basePath: BASE },
      { label: 'Deductions & Adjustments', path: 'tabulation/deductions', icon: SlidersHorizontal, scoped: true, basePath: BASE },
      { label: 'Validation', path: 'tabulation/validation', icon: ClipboardList, scoped: true, basePath: BASE },
      { label: 'Rankings', path: 'tabulation/results', icon: ListOrdered, scoped: true, basePath: BASE },
      { label: 'Finalization', path: 'tabulation/finalization', icon: Award, scoped: true, basePath: BASE },
      { label: 'Round Advancement', path: 'tabulation/advancement', icon: Rocket, scoped: true, basePath: BASE },
      { label: 'Audit Trail', path: 'tabulation/audit', icon: History, scoped: true, basePath: BASE },
    ],
  },
  { label: 'Results & Rankings', path: 'rankings', icon: Award, scoped: true, basePath: BASE },
  { label: 'Analytics', path: 'analytics', icon: BarChart3, scoped: true, basePath: BASE },
  { label: 'Report', path: 'report', icon: FileText, scoped: true, basePath: BASE },
]

export default function PageantLayout() {
  const { eventId } = useParams()

  return (
    <AppShell
      title="Competition Scoring"
      moduleLabel="Competition Scoring"
      headerLabel="Competition"
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
