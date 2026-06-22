import { asyncHandler } from '../utils/asyncHandler.js'
import * as authService from '../services/auth.service.js'
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js'
import { issueCsrfToken, clearCsrfCookie } from '../utils/csrf.js'
import { verifyAccessToken, verifyRefreshToken } from '../utils/jwt.js'
import { env } from '../config/env.js'
import {
  validateAdminLogin,
  validateEmailLogin,
  validateChangePassword,
} from '../validators/auth.validator.js'
import {
  validateForgotPassword,
  validateResetPassword,
} from '../validators/email.validator.js'
import * as passwordResetService from '../services/password-reset.service.js'
import { createAuditLog } from '../services/admin.service.js'

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

export const adminLogin = asyncHandler(async (req, res) => {
  const credentials = validateAdminLogin(req.body)
  try {
    const tokens = await authService.loginAdmin(credentials)
    await writeAuthAudit({
      action: 'ADMIN_LOGIN_SUCCESS',
      userId: tokens.user?.id ?? null,
      entityId: tokens.user?.id ?? null,
      details: {
        username: tokens.user?.username ?? null,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    })
    return sendAuthResponse(res, tokens, { remember: credentials.remember })
  } catch (error) {
    await writeAuthAudit({
      action: 'ADMIN_LOGIN_FAILED',
      details: {
        username: credentials.username,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        message: error.message,
      },
    })
    throw error
  }
})

export const organizerLogin = asyncHandler(async (req, res) => {
  const credentials = validateEmailLogin(req.body)
  try {
    const tokens = await authService.loginOrganizer(credentials)
    await writeAuthAudit({
      action: 'ORGANIZER_LOGIN_SUCCESS',
      userId: tokens.user?.id ?? null,
      entityId: tokens.user?.id ?? null,
      details: {
        email: tokens.user?.email ?? credentials.email,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    })
    return sendAuthResponse(res, tokens, { remember: credentials.remember })
  } catch (error) {
    await writeAuthAudit({
      action: 'ORGANIZER_LOGIN_FAILED',
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

export const voterLogin = asyncHandler(async (req, res) => {
  const credentials = validateEmailLogin(req.body)
  try {
    const tokens = await authService.loginVoter(credentials)
    await writeAuthAudit({
      action: 'VOTER_LOGIN_SUCCESS',
      userId: tokens.user?.id ?? null,
      entityId: tokens.user?.id ?? null,
      details: {
        email: tokens.user?.email ?? credentials.email,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    })
    return sendAuthResponse(res, tokens, { remember: credentials.remember })
  } catch (error) {
    await writeAuthAudit({
      action: 'VOTER_LOGIN_FAILED',
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
  const tokens = await authService.refreshSession(decoded.sub, decoded.tokenVersion)
  sendAuthResponse(res, tokens)
})

export const logout = asyncHandler(async (_req, res) => {
  const token =
    _req.cookies?.[env.jwt.accessCookieName] ||
    (_req.headers.authorization?.startsWith('Bearer ')
      ? _req.headers.authorization.slice(7)
      : null)

  let userId = null

  if (token) {
    try {
      const decoded = verifyAccessToken(token)
      userId = decoded.sub ?? null
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

  if (userId) {
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

  const tokens = await authService.issueSessionForUser(user.id)

  setAuthCookies(res, tokens)
  const csrfToken = issueCsrfToken(res)
  res.json({
    success: true,
    message: 'Password updated successfully',
    csrfToken,
    user: tokens.user,
  })
})
