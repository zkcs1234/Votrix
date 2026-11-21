import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'
import { USER_ROLES, isParticipantRole } from '@/utils/constants'
import { effectiveWorkspaceRole, isOfficer, isOrganizerPath } from '@/utils/workspace'
import { useParticipantSync } from '@/hooks/useParticipantSync'
import AppShell from '@/layouts/AppShell'
import {
  LayoutDashboard, Users, CalendarDays, Settings, ClipboardList, BarChart3,
  UserCog, GraduationCap, Briefcase, CalendarCheck2, History, Trophy,
} from 'lucide-react'

export default function DashboardLayout({
  title = 'Dashboard',
  moduleLabel: moduleLabelOverride,
  showSidebar = true,
  // Task pages (ballot, poll, scoring) keep the sidebar as a collapsed rail so
  // the task has the full width.
  railOnly = false,
  showBackButton = false,
  backButtonPath = '/participant',
}) {
  const { role: accountRole, user } = useAuth()
  const { pathname } = useLocation()
  // A student officer is rendered with the organizer layout while inside
  // /organizer (see utils/workspace.js); everywhere else they are a participant.
  const role = effectiveWorkspaceRole(user, pathname)
  const officer = isOfficer(user)
  const inOrganizerWorkspace = officer && isOrganizerPath(pathname)
  const home = getRoleDashboardPath(role)
  const onHomePage = pathname.replace(/\/+$/, '') === home
  const isAdmin = role === USER_ROLES.ADMIN
  const isOrganizer = role === USER_ROLES.ORGANIZER
  const isParticipant = isParticipantRole(role)
  // Only the real organizer manages officers; an officer never sees that entry.
  const isOwnerOrganizer = accountRole === USER_ROLES.ORGANIZER

  // Students and judges: keep the officership / account type fresh, since both
  // are changed by someone else while the page is open.
  useParticipantSync(isParticipantRole(accountRole) && !inOrganizerWorkspace)

  // Figma sidebars: admin = Overview > Admin dashboard; organizer = Workspace >
  // Overview, Reports. Labels only: paths and permissions are unchanged.
  const navItems = [
    { section: isAdmin ? 'Overview' : 'Workspace' },
    {
      label: isAdmin ? 'Admin Dashboard' : isParticipant ? 'Participant Dashboard' : 'Organizer Dashboard',
      path: home,
      icon: LayoutDashboard,
      isActive: (loc) => loc.pathname === home,
    },
    // Participants (students and judges): the same four pages for everyone; the
    // account type only changes what each page shows.
    ...(isParticipant
      ? [
          {
            label: 'My events',
            path: '/participant/my-events',
            icon: CalendarCheck2,
            // The event pages you open from the list belong to this entry too.
            isActive: (loc) =>
              loc.pathname.startsWith('/participant/my-events') ||
              loc.pathname.startsWith('/participant/events/') ||
              loc.pathname.startsWith('/participant/polling/') ||
              loc.pathname.startsWith('/participant/competition/'),
          },
          {
            label: 'History',
            path: '/participant/history',
            icon: History,
            isActive: (loc) => loc.pathname.startsWith('/participant/history'),
          },
          {
            label: 'Results',
            path: '/participant/results',
            icon: Trophy,
            isActive: (loc) => loc.pathname.startsWith('/participant/results'),
          },
        ]
      : []),
    ...(isOrganizer
      ? [
          {
            label: 'Reports',
            path: '/organizer/reports',
            icon: BarChart3,
            isActive: (loc) => loc.pathname.startsWith('/organizer/reports'),
          },
          ...(isOwnerOrganizer
            ? [
                {
                  label: 'Account Manager',
                  path: '/organizer/officers',
                  icon: UserCog,
                  isActive: (loc) => loc.pathname.startsWith('/organizer/officers'),
                },
              ]
            : []),
          ...(inOrganizerWorkspace
            ? [
                { section: 'Switch' },
                { label: 'Student view', path: '/participant', icon: GraduationCap, isActive: () => false },
              ]
            : []),
        ]
      : []),
    // An officer on their student pages gets a way into the organizer workspace.
    ...(officer && !inOrganizerWorkspace && isParticipantRole(accountRole)
      ? [
          { section: 'Organizer workspace' },
          { label: 'Open workspace', path: '/organizer', icon: Briefcase, isActive: () => false },
        ]
      : []),

    ...(isAdmin
      ? [
          // Grouped into Manage → System → Monitoring so the sidebar reads as
          // clean sections, matching the Competition module's grouped layout.
          { section: 'Manage' },
          {
            label: 'Organizers',
            path: '/admin/organizers',
            icon: Users,
            // Also covers the organizer detail page (/admin/organizers/:id).
            isActive: (loc) => loc.pathname.startsWith('/admin/organizers'),
          },
          {
            label: 'Participants',
            path: '/admin/participants',
            icon: GraduationCap,
            isActive: (loc) => loc.pathname.startsWith('/admin/participants'),
          },
          {
            label: 'Events',
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

          { section: 'Monitoring' },
          {
            label: 'Audit Logs',
            path: '/admin/audit-logs',
            icon: ClipboardList,
            isActive: (loc) => loc.pathname.startsWith('/admin/audit-logs'),
          },
        ]
      : []),
  ]

  return (
    <AppShell
      title={title}
      moduleLabel={moduleLabelOverride ?? (isParticipant ? undefined : role)}
      headerLabel={isAdmin ? 'Administration' : undefined}
      sidebarCaption={isAdmin ? 'Administration' : undefined}
      // The organizer's "Organizer home" link is for other pages. On the organizer
      // dashboard itself it would just point at the page you are already on, so it
      // is left out there.
      footerLink={
        isOrganizer && !onHomePage
          ? { to: '/organizer', label: '← Organizer home' }
          : undefined
      }
      homeLink={home}
      navItems={navItems}
      showSidebar={showSidebar}
      railOnly={railOnly}
      showSearch={!isParticipantRole(role)}
      showBackButton={showBackButton}
      backButtonPath={backButtonPath}
    />
  )
}
