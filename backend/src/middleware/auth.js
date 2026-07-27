import crypto from 'crypto'
import { ApiError } from '../utils/ApiError.js'
import { verifyAccessToken } from '../utils/jwt.js'
import { env } from '../config/env.js'
import { findUserById } from '../services/user.service.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'
import { db } from '../foundation/db.js'

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

/**
 * Block dashboard/API access until the organizer's profile is complete.
 * An organizer must fill in organization_name, organization_type_display,
 * organizer_name, and position before accessing the dashboard.
 *
 * This middleware is applied to all organizer module routes (election,
 * competition, polling, reports) and the main dashboard/analytics routes.
 * It does NOT block the profile endpoints themselves (those are placed
 * before this middleware in the route config).
 */
export function requireProfileComplete(req, _res, next) {
  // Only applies to organizers
  if (req.user?.role !== USER_ROLES.ORGANIZER) {
    return next()
  }

  // Check profile completion synchronously using a direct DB query
  db()
    .from(DB_TABLES.USERS)
    .select('organization_name, organization_type_display, organizer_name, position')
    .eq('id', req.user.id)
    .eq('role', USER_ROLES.ORGANIZER)
    .single()
    .then(({ data, error }) => {
      if (error || !data) {
        return next(new ApiError(500, 'Failed to verify profile status'))
      }

      const complete = Boolean(
        data.organization_name?.trim() &&
        data.organization_type_display?.trim() &&
        data.organizer_name?.trim() &&
        data.position?.trim(),
      )

      if (!complete) {
        return next(
          new ApiError(403, 'Complete your organization profile before continuing', {
            code: 'PROFILE_INCOMPLETE',
          }),
        )
      }

      next()
    })
    .catch(() => next(new ApiError(500, 'Failed to verify profile status')))
}

/**
 * Middleware factory: Requires the authenticated user to be an event participant
 * with one of the specified participant types.
 *
 * Usage: router.get('/events/:eventId/ballot', requireEventParticipant('ELECTION_VOTER'), handler)
 * Usage: router.use(requireEventParticipant('ELECTION_VOTER', 'COMPETITION_JUDGE'))
 *
 * Attaches req.participant with the full event_participants row.
 * eventId is resolved from req.params.eventId.
 */
import { findEventParticipant } from '../services/participant.service.js'

export function requireEventParticipant(...allowedTypes) {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        return next(new ApiError(401, 'Authentication required'))
      }

      const eventId = req.params.eventId
      if (!eventId) {
        return next(new ApiError(400, 'Event ID is required'))
      }

      const participant = await findEventParticipant(eventId, req.user.id)

      if (!participant) {
        return next(
          new ApiError(403, 'You are not a participant in this event'),
        )
      }

      if (allowedTypes.length > 0 && !allowedTypes.includes(participant.participant_type)) {
        return next(
          new ApiError(
            403,
            `This action requires one of these roles: ${allowedTypes.join(', ')}`,
          ),
        )
      }

      req.participant = participant
      next()
    } catch (error) {
      next(error)
    }
  }
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
