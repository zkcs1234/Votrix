import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'
import { USER_ROLES, isParticipantRole } from '@/utils/constants'
import AppShell from '@/layouts/AppShell'
import {
  LayoutDashboard, Users, CalendarDays, Settings, ClipboardList, Bell, Archive, Monitor, Mail, BarChart3,
} from 'lucide-react'

export default function DashboardLayout({
  title = 'Dashboard',
  moduleLabel: moduleLabelOverride,
  showSidebar = true,
  showBackButton = false,
  backButtonPath = '/participant',
}) {
  const { role } = useAuth()
  const home = getRoleDashboardPath(role)
  const isAdmin = role === USER_ROLES.ADMIN
  const isOrganizer = role === USER_ROLES.ORGANIZER

  // Figma sidebars: admin = Overview > Admin dashboard; organizer = Workspace >
  // Overview, Reports. Labels only: paths and permissions are unchanged.
  const navItems = [
    { section: isAdmin ? 'Overview' : 'Workspace' },
    {
      label: isAdmin ? 'Admin Dashboard' : 'Overview',
      path: home,
      icon: LayoutDashboard,
      isActive: (loc) => loc.pathname === home,
    },
    ...(isOrganizer
      ? [
          {
            label: 'Reports',
            path: '/organizer/reports',
            icon: BarChart3,
            isActive: (loc) => loc.pathname.startsWith('/organizer/reports'),
          },
        ]
      : []),

    ...(isAdmin
      ? [
          // Grouped into Manage → System → Monitoring so the sidebar reads as
          // clean sections, matching the Competition module's grouped layout.
          { section: 'Manage' },
          {
            label: 'User Management',
            path: '/admin/users',
            icon: Users,
            isActive: (loc) =>
              loc.pathname.startsWith('/admin/users') || loc.pathname.startsWith('/admin/organizers'),
          },
          {
            label: 'Global Events',
            path: '/admin/events',
            icon: CalendarDays,
            isActive: (loc) => loc.pathname.startsWith('/admin/events'),
          },

          { section: 'System' },
          {
            label: 'System Settings',
            path: '/admin/settings',
            icon: Settings,
            isActive: (loc) => loc.pathname.startsWith('/admin/settings'),
          },
          {
            label: 'Archival Policy',
            path: '/admin/archival',
            icon: Archive,
            isActive: (loc) => loc.pathname.startsWith('/admin/archival'),
          },

          { section: 'Monitoring' },
          {
            label: 'System Health',
            path: '/admin/health',
            icon: Monitor,
            isActive: (loc) => loc.pathname.startsWith('/admin/health'),
          },
          {
            label: 'Alerts',
            path: '/admin/alerts',
            icon: Bell,
            isActive: (loc) => loc.pathname.startsWith('/admin/alerts'),
          },
          {
            label: 'Audit Logs',
            path: '/admin/audit-logs',
            icon: ClipboardList,
            isActive: (loc) => loc.pathname.startsWith('/admin/audit-logs'),
          },
          {
            label: 'Email Delivery',
            path: '/admin/email-delivery',
            icon: Mail,
            isActive: (loc) => loc.pathname.startsWith('/admin/email-delivery'),
          },
        ]
      : []),
  ]

  return (
    <AppShell
      title={title}
      moduleLabel={moduleLabelOverride ?? role}
      headerLabel={isAdmin ? 'Administration' : undefined}
      sidebarCaption={isAdmin ? 'Administration' : undefined}
      footerLink={
        isAdmin
          ? { to: '/admin', label: '← VOTRIX administration' }
          : isOrganizer
            ? { to: '/organizer', label: '← Organizer home' }
            : undefined
      }
      homeLink={home}
      navItems={navItems}
      showSidebar={showSidebar}
      showSearch={!isParticipantRole(role)}
      showBackButton={showBackButton}
      backButtonPath={backButtonPath}
    />
  )
}
