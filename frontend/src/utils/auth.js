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

const VOTER_EVENT_PATHS = [
  /^\/voter\/events\/[^/]+\/?$/,
  /^\/voter\/polling\/events\/[^/]+\/?$/,
  /^\/voter\/competition\/events\/[^/]+\/score\/?$/,
]

export function getSafeVoterDestination(from) {
  if (!from) return null

  let location = from
  if (typeof from === 'string') {
    if (!from.startsWith('/') || from.startsWith('//')) return null
    location = new URL(from, 'https://votrix.local')
  }

  const { pathname, search = '', hash = '' } = location
  if (!pathname || !VOTER_EVENT_PATHS.some((pattern) => pattern.test(pathname))) {
    return null
  }

  return `${pathname}${search}${hash}`
}

