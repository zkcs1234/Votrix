import { BarChart3, LayoutDashboard } from 'lucide-react'
import AppShell from '@/layouts/AppShell'

const navItems = [
  { section: 'Workspace' },
  { label: 'Overview', path: '/organizer', icon: LayoutDashboard },
  { label: 'Reports', path: '/organizer/reports', icon: BarChart3 },
]

export default function ReportsLayout() {
  return (
    <AppShell
      title="Analytics & reports"
      moduleLabel="Reports"
      headerLabel="Organizer"
      homeLink="/organizer/reports"
      navItems={navItems}
      footerLink={{ to: '/organizer', label: '← Organizer home' }}
    />
  )
}
