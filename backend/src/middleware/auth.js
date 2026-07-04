import crypto from 'crypto'
import { ApiError } from '../utils/ApiError.js'
import { verifyAccessToken } from '../utils/jwt.js'
import { env } from '../config/env.js'
import { findUserById } from '../services/user.service.js'

// CWE-208: Constant-time integer comparison for token version.
// Converts both sides to a fixed 16-byte hex string before comparing.
function tokenVersionEqual(a, b) {
  const buf = (n) => Buffer.from(String(Number(n ?? 0)).padStart(16, '0'))
  return crypto.timingSafeEqual(buf(a), buf(b))
}

function extractAccessToken(req) {
  return req.cookies?.[env.jwt.accessCookieName] || null
}

export async function authenticate(req, _res, next) {
  try {
    const token = extractAccessToken(req)
    if (!token) {
      throw new ApiError(401, 'Authentication required')
    }

    const decoded = verifyAccessToken(token)
    const user = await findUserById(decoded.sub)

    if (!user) {
      throw new ApiError(401, 'User not found')
    }

    if (!tokenVersionEqual(user.token_version, decoded.tokenVersion)) {
      throw new ApiError(401, 'Session has been revoked')
    }

    req.user = {
      id: decoded.sub,
      role: decoded.role,
      username: decoded.username,
      email: decoded.email,
      accountStatus: decoded.accountStatus,
      mustChangePassword: Boolean(decoded.mustChangePassword),
      tokenVersion: decoded.tokenVersion ?? 0,
    }
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Invalid or expired access token'))
    }
    next(error)
  }
}

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'))
    }
    if (roles.length && !roles.includes(req.user.role)) {
      console.error('[authorize] Insufficient permissions:', {
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
      })
      return next(new ApiError(403, 'Insufficient permissions'))
    }
    next()
  }
}

/** Block dashboard/API access until password is changed (organizer/voter first login). */
export function requirePasswordChanged(req, _res, next) {
  if (req.user?.mustChangePassword) {
    return next(
      new ApiError(403, 'You must change your password before continuing', {
        code: 'MUST_CHANGE_PASSWORD',
      }),
    )
  }
  next()
}

export async function requireActiveAccount(req, _res, next) {
  try {
    const user = await findUserById(req.user?.id)
    if (!user) {
      return next(new ApiError(401, 'User not found'))
    }

    if (!tokenVersionEqual(user.token_version, req.user?.tokenVersion)) {
      return next(new ApiError(401, 'Session has been revoked'))
    }

    if (user.account_status === 'active') {
      return next()
    }

    if (user.account_status === 'pending') {
      return next(new ApiError(403, 'Your account is pending approval'))
    }

    if (user.account_status === 'suspended') {
      return next(new ApiError(403, 'Your account has been suspended'))
    }

    if (user.account_status === 'archived') {
      return next(new ApiError(403, 'Your account is archived'))
    }

    return next(new ApiError(403, 'Your account is not active'))
  } catch (error) {
    return next(error)
  }
}
