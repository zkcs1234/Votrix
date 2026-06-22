import { ApiError } from '../utils/ApiError.js'
import { sanitizeEmail, sanitizeString } from '../utils/sanitize.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateAdminLogin(body) {
  const { username, password, remember } = body ?? {}

  if (!username?.trim() || !password) {
    throw new ApiError(400, 'Username and password are required')
  }

  return { username: sanitizeString(username, 64), password, remember: Boolean(remember) }
}

export function validateEmailLogin(body) {
  const { email, password, remember } = body ?? {}

  if (!email?.trim() || !password) {
    throw new ApiError(400, 'Email and password are required')
  }

  if (!EMAIL_RE.test(email.trim())) {
    throw new ApiError(400, 'Invalid email format')
  }

  return { email: sanitizeEmail(email), password, remember: Boolean(remember) }
}

export function validateChangePassword(body) {
  const { currentPassword, newPassword, confirmPassword } = body ?? {}

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new ApiError(400, 'All password fields are required')
  }

  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters')
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(400, 'Passwords do not match')
  }

  return { currentPassword, newPassword }
}

export function validateCreateOrganizer(body) {
  const { email, password } = body ?? {}

  if (!email?.trim() || !password) {
    throw new ApiError(400, 'Email and password are required')
  }

  if (!EMAIL_RE.test(email.trim())) {
    throw new ApiError(400, 'Invalid email format')
  }

  if (password.length < 8) {
    throw new ApiError(400, 'Temporary password must be at least 8 characters')
  }

  return { email: sanitizeEmail(email), password }
}
