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
            label: 'Organizer Management',
            path: '/admin/organizers',
            isActive: (loc) => loc.pathname.startsWith('/admin/organizers'),
          },
          {
            label: 'Global Events',
            path: '/admin/events',
            isActive: (loc) => loc.pathname.startsWith('/admin/events'),
          },
          {
            label: 'System Settings',
            path: '/admin/settings',
            isActive: (loc) => loc.pathname.startsWith('/admin/settings'),
          },

          {
            label: 'Audit Logs',
            path: '/admin/audit-logs',
            isActive: (loc) => loc.pathname.startsWith('/admin/audit-logs'),
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
