import { asyncHandler } from '../utils/asyncHandler.js'
import * as authService from '../services/auth.service.js'
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js'
import { issueCsrfToken, clearCsrfCookie } from '../utils/csrf.js'
import { verifyRefreshToken } from '../utils/jwt.js'
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

function sendAuthResponse(res, { accessToken, refreshToken, user }) {
  setAuthCookies(res, { accessToken, refreshToken })
  const csrfToken = issueCsrfToken(res)

  res.json({
    success: true,
    accessToken,
    csrfToken,
    user,
  })
}

export const getCsrfToken = asyncHandler(async (_req, res) => {
  const csrfToken = issueCsrfToken(res)
  res.json({ success: true, csrfToken })
})

export const adminLogin = asyncHandler(async (req, res) => {
  const credentials = validateAdminLogin(req.body)
  const tokens = await authService.loginAdmin(credentials)
  sendAuthResponse(res, tokens)
})

export const organizerLogin = asyncHandler(async (req, res) => {
  const credentials = validateEmailLogin(req.body)
  const tokens = await authService.loginOrganizer(credentials)
  sendAuthResponse(res, tokens)
})

export const voterLogin = asyncHandler(async (req, res) => {
  const credentials = validateEmailLogin(req.body)
  const tokens = await authService.loginVoter(credentials)
  sendAuthResponse(res, tokens)
})

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.jwt.refreshCookieName]

  if (!token) {
    clearAuthCookies(res)
    return res.status(401).json({ success: false, message: 'Refresh token missing' })
  }

  const decoded = verifyRefreshToken(token)
  const tokens = await authService.refreshSession(decoded.sub)
  sendAuthResponse(res, tokens)
})

export const logout = asyncHandler(async (_req, res) => {
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

  const tokens = await authService.refreshSession(req.user.id)

  setAuthCookies(res, tokens)
  const csrfToken = issueCsrfToken(res)
  res.json({
    success: true,
    message: 'Password updated successfully',
    accessToken: tokens.accessToken,
    csrfToken,
    user,
  })
})
