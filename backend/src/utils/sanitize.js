import { ApiError } from './ApiError.js'

/**
 * Strip HTML tags and trim user-provided strings before persistence.
 */
export function sanitizeString(value, maxLength = 10_000) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'string') return value

  const cleaned = value
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/\0/g, '')

  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned
}

export function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return email
  return sanitizeString(email, 320).toLowerCase()
}

// CWE-20: Validate that a route parameter is a well-formed UUID v4.
// Malformed IDs (path traversal, SQL fragments, etc.) are rejected before
// they reach the service layer or the database.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateUUID(value, fieldName = 'id') {
  if (!value || typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ApiError(400, `Invalid ${fieldName}: must be a valid UUID`)
  }
  return value
}

export function validateRouteUUIDParams(req, _res, next) {
  try {
    if (!req.params || typeof req.params !== 'object') {
      return next()
    }

    for (const [key, value] of Object.entries(req.params)) {
      if (typeof value !== 'string') continue
      if (key === 'id' || key.endsWith('Id')) {
        validateUUID(value, key)
      }
    }

    next()
  } catch (error) {
    next(error)
  }
}
