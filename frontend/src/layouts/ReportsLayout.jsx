import AppShell from '@/layouts/AppShell'

const navItems = [
  { label: 'Overview', path: '/organizer/reports' },
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
