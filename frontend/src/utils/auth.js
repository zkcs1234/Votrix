import { USER_ROLES } from '@/utils/constants'

export function getRoleDashboardPath(role) {
  switch (role) {
    case USER_ROLES.ADMIN:
      return '/admin'
    case USER_ROLES.ORGANIZER:
      return '/organizer'
    case USER_ROLES.VOTER:
      return '/voter'
    default:
      return '/'
  }
}

export function getRoleLoginPath(role) {
  switch (role) {
    case USER_ROLES.ADMIN:
      return '/login/admin'
    case USER_ROLES.ORGANIZER:
      return '/login/organizer'
    case USER_ROLES.VOTER:
      return '/login/voter'
    default:
      return '/'
  }
}
