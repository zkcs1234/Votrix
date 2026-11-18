import { ApiError } from '../utils/ApiError.js'
import { normalizePasswordInput } from '../utils/password.js'

import { EMAIL_RE } from '../../../shared/form-rules.js'

export function validateEmailField(email) {
  if (!email?.trim()) {
    throw new ApiError(400, 'Email is required')
  }
  if (!EMAIL_RE.test(email.trim())) {
    throw new ApiError(400, 'Invalid email format')
  }
  return email.trim().toLowerCase()
}

export function validateEventNotification(body) {
  const message = body?.message?.trim()
  if (!message) {
    throw new ApiError(400, 'Notification message is required')
  }
  if (message.length > 2000) {
    throw new ApiError(400, 'Message must be under 2000 characters')
  }
  return { message }
}

export function validateForgotPassword(body) {
  return { email: validateEmailField(body?.email) }
}

export function validateResetPassword(body) {
  const { token } = body ?? {}
  const newPassword = normalizePasswordInput(body?.newPassword)
  const confirmPassword = normalizePasswordInput(body?.confirmPassword)

  if (!token?.trim()) {
    throw new ApiError(400, 'Reset token is required')
  }
  if (!newPassword || newPassword.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters')
  }
  if (newPassword !== confirmPassword) {
    throw new ApiError(400, 'Passwords do not match')
  }

  return { token: token.trim(), newPassword }
}
