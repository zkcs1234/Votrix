import { BarChart3, LayoutDashboard, UserCog } from 'lucide-react'
import AppShell from '@/layouts/AppShell'
import { useAuth } from '@/hooks/useAuth'
import { USER_ROLES } from '@/utils/constants'

const baseNavItems = [
  { section: 'Workspace' },
  { label: 'Organizer Dashboard', path: '/organizer', icon: LayoutDashboard },
  { label: 'Reports', path: '/organizer/reports', icon: BarChart3 },
]

// Same entry the organizer dashboard sidebar shows. Only the real organizer
// manages officers; an officer working inside /organizer never sees it.
const accountManagerItem = {
  label: 'Account Manager',
  path: '/organizer/officers',
  icon: UserCog,
  isActive: (loc) => loc.pathname.startsWith('/organizer/officers'),
}

export default function ReportsLayout() {
  const { role: accountRole } = useAuth()
  const navItems = accountRole === USER_ROLES.ORGANIZER ? [...baseNavItems, accountManagerItem] : baseNavItems

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
