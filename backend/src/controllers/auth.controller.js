import { asyncHandler } from '../utils/asyncHandler.js'
import * as authService from '../services/auth.service.js'
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js'
import { issueCsrfToken, clearCsrfCookie } from '../utils/csrf.js'
import { verifyAccessToken, verifyRefreshToken } from '../utils/jwt.js'
import { env } from '../config/env.js'
import {
  validateLogin,
  validateChangePassword,
} from '../validators/auth.validator.js'
import {
  validateForgotPassword,
  validateResetPassword,
} from '../validators/email.validator.js'
import * as passwordResetService from '../services/password-reset.service.js'
import { createAuditLog } from '../services/admin.service.js'
import {
  revokeSession as deleteSessionRow,
  revokeAllSessionsForUser,
  sessionMeta,
} from '../services/session.service.js'

function sendAuthResponse(res, { accessToken, refreshToken, user }, { remember = false } = {}) {
  setAuthCookies(res, { accessToken, refreshToken }, { remember })
  const csrfToken = issueCsrfToken(res)

  res.json({
    success: true,
    // accessToken now ONLY in HTTP-only cookie - not exposed to JavaScript
    csrfToken,
    user,
  })
}

async function writeAuthAudit({
  action,
  userId = null,
  entityId = null,
  details = {},
}) {
  try {
    await createAuditLog({
      userId,
      action,
      entity: 'users',
      entityId,
      details,
    })
  } catch {
    // Authentication should not fail just because audit storage is unavailable.
  }
}

export const getCsrfToken = asyncHandler(async (_req, res) => {
  const csrfToken = issueCsrfToken(res)
  res.json({ success: true, csrfToken })
})

// Unified login handler - works for admin, organizer, and voter
export const login = asyncHandler(async (req, res) => {
  const credentials = validateLogin(req.body)

  try {
    const { ip, userAgent } = sessionMeta.extractClientMeta(req)
    const tokens = await authService.login(credentials, { ip, userAgent })

    await writeAuthAudit({
      action: `${tokens.user.role.toUpperCase()}_LOGIN_SUCCESS`,
      userId: tokens.user?.id ?? null,
      entityId: tokens.user?.id ?? null,
      details: {
        email: tokens.user?.email ?? credentials.email,
        role: tokens.user?.role,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    })

    return sendAuthResponse(res, tokens, { remember: credentials.remember })
  } catch (error) {
    await writeAuthAudit({
      action: 'LOGIN_FAILED',
      details: {
        email: credentials.email,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        message: error.message,
      },
    })
    throw error
  }
})

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.jwt.refreshCookieName]

  if (!token) {
    clearAuthCookies(res)
    return res.status(401).json({ success: false, message: 'Refresh token missing' })
  }

  const decoded = verifyRefreshToken(token)
  const { ip, userAgent } = sessionMeta.extractClientMeta(req)
  const tokens = await authService.refreshSession(decoded.sub, decoded.tokenVersion, {
    sessionId: decoded.sid ?? null,
    ip,
    userAgent,
  })
  sendAuthResponse(res, tokens)
})

export const logout = asyncHandler(async (_req, res) => {
  const token =
    _req.cookies?.[env.jwt.accessCookieName] ||
    (_req.headers.authorization?.startsWith('Bearer ')
      ? _req.headers.authorization.slice(7)
      : null)

  let userId = null
  let sessionId = null

  if (token) {
    try {
      const decoded = verifyAccessToken(token)
      userId = decoded.sub ?? null
      sessionId = decoded.sid ?? null
      await writeAuthAudit({
        action: 'USER_LOGOUT',
        userId,
        entityId: userId,
        details: {
          role: decoded.role ?? null,
          username: decoded.username ?? null,
          email: decoded.email ?? null,
          ip: _req.ip ?? null,
          userAgent: _req.get('user-agent') ?? null,
        },
      })
    } catch {
      // Ignore invalid/expired tokens during logout cleanup.
    }
  }

  if (sessionId) {
    // End only THIS session; sessions on the user's other devices stay valid.
    try {
      await deleteSessionRow(sessionId)
    } catch {
      // The row may already be gone — still clear cookies below.
    }
  } else if (userId) {
    // Legacy token with no session binding — fall back to a global revoke.
    try {
      await authService.revokeSession(userId)
    } catch {
      // Still clear cookies even if revocation fails.
    }
  }

  clearAuthCookies(res)
  clearCsrfCookie(res)
  res.json({ success: true, message: 'Logged out' })
})

export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id)
  res.json({ success: true, user })
})

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = validateForgotPassword(req.body)
  const result = await passwordResetService.requestPasswordReset(email)
  res.json(result)
})

export const resetPassword = asyncHandler(async (req, res) => {
  const payload = validateResetPassword(req.body)
  const result = await passwordResetService.resetPasswordWithToken(payload)
  res.json(result)
})

export const changePassword = asyncHandler(async (req, res) => {
  const payload = validateChangePassword(req.body)
  const user = await authService.changePassword(req.user.id, payload)

  // The password change bumped token_version, invalidating every existing
  // token; drop the now-dead session rows before starting a fresh session.
  try {
    await revokeAllSessionsForUser(user.id)
  } catch {
    // Best-effort cleanup — do not block the password change.
  }

  const { ip, userAgent } = sessionMeta.extractClientMeta(req)
  const tokens = await authService.issueSessionForUser(user.id, { ip, userAgent })

  await writeAuthAudit({
    action: 'auth.password.change',
    userId: user.id,
    entityId: user.id,
    details: { role: user.role ?? null },
  })

  setAuthCookies(res, tokens)
  const csrfToken = issueCsrfToken(res)
  res.json({
    success: true,
    message: 'Password updated successfully',
    csrfToken,
    user: tokens.user,
  })
})

/**
 * Skip password change - allows voters to keep their temporary password.
 */
export const skipPasswordChange = asyncHandler(async (req, res) => {
  const user = await authService.skipPasswordChange(req.user.id)

  // Replace the temporary-password session with a fresh one so the same
  // browser doesn't leave a stray duplicate row; other devices are untouched.
  if (req.user?.sessionId) {
    try {
      await deleteSessionRow(req.user.sessionId)
    } catch {
      // The row may already be gone — continue issuing the new session.
    }
  }

  // Issue new session tokens since must_change_password changed
  const { ip, userAgent } = sessionMeta.extractClientMeta(req)
  const tokens = await authService.issueSessionForUser(user.id, { ip, userAgent })

  await writeAuthAudit({
    action: 'auth.password.change_skipped',
    userId: user.id,
    entityId: user.id,
    details: { role: user.role ?? null },
  })

  setAuthCookies(res, tokens)
  const csrfToken = issueCsrfToken(res)

  res.json({
    success: true,
    message: 'You can continue with your current password',
    csrfToken,
    user: tokens.user,
  })
})
