import { USER_ROLES } from '@/utils/constants'

export function getRoleDashboardPath(role) {
  switch (role) {
    case USER_ROLES.ADMIN:
      return '/admin'
    case USER_ROLES.ORGANIZER:
      return '/organizer'
    case USER_ROLES.PARTICIPANT:
    case USER_ROLES.VOTER:
      return '/participant'
    default:
      return '/'
  }
}

const PARTICIPANT_EVENT_PATHS = [
  /^\/participant\/events\/[^/]+\/?$/,
  /^\/participant\/polling\/events\/[^/]+\/?$/,
  /^\/participant\/competition\/events\/[^/]+\/score\/?$/,
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
  if (!pathname || !PARTICIPANT_EVENT_PATHS.some((pattern) => pattern.test(pathname))) {
    return null
  }

  return `${pathname}${search}${hash}`
}

