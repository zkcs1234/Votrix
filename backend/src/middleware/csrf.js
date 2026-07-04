import crypto from 'crypto'
import { ApiError } from '../utils/ApiError.js'
import { env } from '../config/env.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Paths under /api that do not require CSRF (token issuance, health, and public login). */
const EXEMPT_PATHS = new Set([
  '/auth/csrf',
  '/auth/admin/login',
  '/auth/organizer/login',
  '/auth/voter/login',
  '/auth/refresh',
  '/auth/change-password',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
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

  // Requests authenticated via a Bearer token are not vulnerable to CSRF
  // because browsers do not automatically attach the Authorization header to cross-site requests.
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next()
  }

  const cookieToken = req.cookies?.[env.csrf.cookieName]
  const headerToken = req.headers[env.csrf.headerName]

  if (
    !cookieToken ||
    !headerToken ||
    typeof cookieToken !== 'string' ||
    typeof headerToken !== 'string' ||
    cookieToken.length < 32
  ) {
    return next(new ApiError(403, 'Invalid or missing CSRF token'))
  }

  // CWE-208: Use constant-time comparison to prevent timing attacks.
  // Pad both buffers to the same length before comparing so unequal-length
  // tokens also take constant time (the length check above already rejects
  // short tokens, but we normalise here for defence-in-depth).
  const a = Buffer.from(cookieToken)
  const b = Buffer.from(headerToken)
  const maxLen = Math.max(a.length, b.length)
  const aPadded = Buffer.concat([a, Buffer.alloc(maxLen - a.length)])
  const bPadded = Buffer.concat([b, Buffer.alloc(maxLen - b.length)])
  if (!crypto.timingSafeEqual(aPadded, bPadded)) {
    return next(new ApiError(403, 'Invalid or missing CSRF token'))
  }

  next()
}
