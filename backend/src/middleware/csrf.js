import { ApiError } from '../utils/ApiError.js'
import { env } from '../config/env.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Paths under /api that do not require CSRF (token issuance, health, and public login). */
const EXEMPT_PATHS = new Set([
  '/auth/csrf',
  '/auth/admin/login',
  '/auth/organizer/login',
  '/auth/voter/login',
  '/health',
  '/health/',
])

function normalizeApiPath(req) {
  const full = req.originalUrl?.split('?')[0] ?? req.path
  if (full.startsWith('/api')) {
    return full.slice(4) || '/'
  }
  return req.path
}

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next()
  }

  const path = normalizeApiPath(req)
  if (EXEMPT_PATHS.has(path) || path.startsWith('/health')) {
    return next()
  }

  const cookieToken = req.cookies?.[env.csrf.cookieName]
  const headerToken = req.headers[env.csrf.headerName]

  if (
    !cookieToken ||
    !headerToken ||
    typeof cookieToken !== 'string' ||
    typeof headerToken !== 'string' ||
    cookieToken.length < 32 ||
    cookieToken !== headerToken
  ) {
    return next(new ApiError(403, 'Invalid or missing CSRF token'))
  }

  next()
}
