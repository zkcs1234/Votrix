const configuredApiUrl = (import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')

// In production, VITE_API_URL must point at the Render API. Falling back to
// the same-origin '/api' only works when a server-side proxy (vercel.json
// rewrites, a Vite dev proxy, or a reverse proxy) is configured to forward
// those calls to the API. We default to the configured URL so misconfigured
// deploys fail loud instead of silently hitting the wrong host.
export const API_BASE_URL = configuredApiUrl

export const USER_ROLES = {
  ADMIN: 'admin',
  ORGANIZER: 'organizer',
  VOTER: 'voter',
}

export const ORG_TYPES = {
  ELECTION: 'election',
  PAGEANT: 'pageant',
  COMPETITION_SCORING: 'competition_scoring',
  POLLING: 'polling',
}

export const ORG_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
}

export const EVENT_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

export const EVENT_TYPES = {
  ELECTION: 'election',
  PAGEANT: 'pageant',
  COMPETITION_SCORING: 'competition_scoring',
  POLLING: 'polling',
}

export const COMPETITION_SCORING_EVENT_TYPES = new Set([
  EVENT_TYPES.PAGEANT,
  EVENT_TYPES.COMPETITION_SCORING,
])

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'votrix_access_token',
  USER: 'votrix_user',
  CSRF_TOKEN: 'votrix_csrf_token',
}
