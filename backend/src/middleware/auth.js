import { ApiError } from '../utils/ApiError.js'
import { verifyAccessToken } from '../utils/jwt.js'
import { env } from '../config/env.js'

function extractAccessToken(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    return header.slice(7)
  }
  return req.cookies?.[env.jwt.accessCookieName] || null
}

export function authenticate(req, _res, next) {
  try {
    const token = extractAccessToken(req)
    if (!token) {
      throw new ApiError(401, 'Authentication required')
    }

    const decoded = verifyAccessToken(token)
    req.user = {
      id: decoded.sub,
      role: decoded.role,
      username: decoded.username,
      email: decoded.email,
      mustChangePassword: Boolean(decoded.mustChangePassword),
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
