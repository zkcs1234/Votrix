import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'
import { USER_ROLES } from '@/utils/constants'
import AppShell from '@/layouts/AppShell'

export default function DashboardLayout({ title = 'Dashboard' }) {
  const { role } = useAuth()
  const home = getRoleDashboardPath(role)

  const navItems = [
    {
      label: 'Overview',
      path: home,
      isActive: (loc) => loc.pathname === home,
    },
    ...(role === USER_ROLES.ADMIN
      ? [
          {
            label: 'Create organizer',
            path: '/admin/organizers/new',
            isActive: (loc) => loc.pathname.startsWith('/admin/organizers'),
          },
        ]
      : []),
  ]

  return (
    <AppShell
      title={title}
      moduleLabel={role}
      homeLink={home}
      navItems={navItems}
    />
  )
}
