import { ApiError } from '../utils/ApiError.js'
import { sanitizeEmail, sanitizeString } from '../utils/sanitize.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Unified login validator - handles admin, organizer, and voter
export function validateLogin(body) {
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
  const { email } = body ?? {}

  if (!email?.trim()) {
    throw new ApiError(400, 'Email is required')
  }

  if (!EMAIL_RE.test(email.trim())) {
    throw new ApiError(400, 'Invalid email format')
  }

  // Password is auto-generated server-side — admins never choose it.
  return { email: sanitizeEmail(email) }
}
