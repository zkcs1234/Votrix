import { ApiError } from './ApiError.js'
import { EVENT_STATUS } from './constants.js'

const RESTRICTED_STATUSES = new Set([
  EVENT_STATUS.ACTIVE,
  EVENT_STATUS.COMPLETED,
  EVENT_STATUS.CANCELLED,
  EVENT_STATUS.ARCHIVED,
])

const CORE_FIELD_KEYS = new Set(['title', 'description', 'banner', 'startDate', 'endDate'])

export function assertEventUpdateAllowed(event, updates = {}) {
  if (!event) return

  const status = event.status
  if (!status || !RESTRICTED_STATUSES.has(status)) return

  const hasCoreFieldUpdate = Object.keys(updates || {}).some((key) => CORE_FIELD_KEYS.has(key))
  if (!hasCoreFieldUpdate) return

  throw new ApiError(400, 'This event cannot be edited because it is already active, completed, or cancelled')
}
