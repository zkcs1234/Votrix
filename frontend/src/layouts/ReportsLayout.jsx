import { BarChart3, ArrowLeft } from 'lucide-react'
import AppShell from '@/layouts/AppShell'

const navItems = [
  { label: 'Overview', path: '/organizer/reports', icon: BarChart3 },
]

export default function ReportsLayout() {
  return (
    <AppShell
      title="Analytics & reports"
      moduleLabel="Reports"
      homeLink="/organizer/reports"
      navItems={navItems}
      footerLink={{ to: '/organizer', label: '← Organizer home' }}
    />
  )
}
