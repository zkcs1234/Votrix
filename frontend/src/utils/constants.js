export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const USER_ROLES = {
  ADMIN: 'admin',
  ORGANIZER: 'organizer',
  VOTER: 'voter',
}

export const ORG_TYPES = {
  ELECTION: 'election',
  PAGEANT: 'pageant',
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
  POLLING: 'polling',
}

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'votrix_access_token',
  USER: 'votrix_user',
  CSRF_TOKEN: 'votrix_csrf_token',
}
