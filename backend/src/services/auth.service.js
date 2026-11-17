import { ApiError } from '../utils/ApiError.js'
import { comparePassword } from '../utils/password.js'
import { USER_ROLES, DB_TABLES, isParticipantRole } from '../utils/constants.js'
import { db } from '../foundation/db.js'
import { resolveOfficerContext, toOfficershipDto } from './organization-officer.service.js'
import { assertPlatformAvailableFor } from './platform-settings.service.js'
import {
  findUserByEmail,
  findUserById,
  updateUserPassword,
  incrementTokenVersion,
  sanitizeUser,
} from './user.service.js'
import { issueTokenPair } from './token.service.js'
import { recordSession, touchSession, isSessionActive } from './session.service.js'

/**
 * Create a `user_sessions` row for a freshly issued token and return its id.
 *
 * Session tracking is best-effort: if the insert fails (e.g. table missing on
 * an un-migrated environment) we return `null` so the token is issued without
 * a session binding and login/refresh never break.
 */
async function createSession(user) {
  try {
    const session = await recordSession({
      userId: user.id,
      tokenVersion: Number(user.token_version ?? 0),
    })
    return session?.id ?? null
  } catch {
    return null
  }
}

function assertAccountActive(user) {
  if (user?.account_status === 'active') return

  if (user?.account_status === 'suspended') {
    throw new ApiError(403, 'Your account has been suspended')
  }

  if (user?.account_status === 'archived') {
    throw new ApiError(403, 'Your account is archived')
  }

  throw new ApiError(403, 'Your account is not active')
}

// Unified login - works for admin, organizer, and voter by email
export async function login({ email, password }) {
  // Find user by email (any role)
  const user = await findUserByEmail(email)

  if (!user) {
    throw new ApiError(401, 'Invalid email or password')
  }

  const valid = await comparePassword(password, user.password)
  if (!valid) {
    throw new ApiError(401, 'Invalid email or password')
  }

  assertAccountActive(user)
  // Maintenance mode: only administrators may sign in (checked after the
  // credentials, so a wrong password still reads as a wrong password).
  await assertPlatformAvailableFor(user.role)

  const sessionId = await createSession(user)
  return issueTokenPair(user, { sessionId })
}

export async function refreshSession(userId, tokenVersion, { sessionId = null } = {}) {
  const user = await findUserById(userId)
  if (!user) {
    throw new ApiError(401, 'User not found')
  }

  if (
    tokenVersion !== undefined &&
    Number(user.token_version ?? 0) !== Number(tokenVersion ?? 0)
  ) {
    throw new ApiError(401, 'Session has been revoked')
  }

  assertAccountActive(user)
  await assertPlatformAvailableFor(user.role)

  let sid = sessionId
  if (sid) {
    // A bound session that was revoked (row deleted) must block the refresh,
    // so an admin revoke takes effect once the short-lived access token lapses.
    if (!(await isSessionActive(sid))) {
      throw new ApiError(401, 'Session has been revoked')
    }
    await touchSession(sid)
  } else {
    // Token pre-dates session tracking — start tracking from this refresh so
    // already-signed-in users appear in the sessions list without re-login.
    sid = await createSession(user)
  }

  return issueTokenPair(user, { sessionId: sid })
}

export async function issueSessionForUser(userId) {
  const user = await findUserById(userId)
  if (!user) {
    throw new ApiError(401, 'User not found')
  }
  assertAccountActive(user)
  const sessionId = await createSession(user)
  return issueTokenPair(user, { sessionId })
}

export async function revokeSession(userId) {
  return incrementTokenVersion(userId)
}

/**
 * Adds `officership` to a participant's user payload: the organization they
 * currently act for as a student officer, or null. This only drives what the UI
 * offers (a link into the organizer workspace); the backend re-checks the
 * officership on every organizer request, so a failure here just hides the link.
 */
export async function attachOfficership(userDto) {
  if (!userDto || !isParticipantRole(userDto.role)) return userDto
  try {
    const context = await resolveOfficerContext(userDto.id)
    const usable = context && context.owner?.account_status === 'active'
    return { ...userDto, officership: usable ? toOfficershipDto(context) : null }
  } catch (err) {
    console.warn('[auth] could not resolve officership:', err.message)
    return { ...userDto, officership: null }
  }
}

/**
 * The participant's active account types (STUDENT or JUDGE; an account is one or
 * the other). Used only to label the UI (role chip, empty states); no
 * authorization decision reads it, access stays per-event enrollment. A failed
 * lookup returns [] so sign-in never breaks.
 */
export async function listParticipantTypes(userId) {
  try {
    const { data, error } = await db()
      .from(DB_TABLES.USER_PARTICIPANT_TYPES)
      .select('participant_type')
      .eq('user_id', userId)
      .eq('is_active', true)
    if (error) throw new Error(error.message)
    return [...new Set((data ?? []).map((row) => row.participant_type))].sort()
  } catch (err) {
    console.warn('[auth] could not resolve participant types:', err.message)
    return []
  }
}

/**
 * Everything the participant UI needs on top of the base user payload: the
 * officership (see attachOfficership) and the account's participant types.
 * Other roles are returned unchanged.
 */
export async function attachParticipantContext(userDto) {
  if (!userDto || !isParticipantRole(userDto.role)) return userDto
  const [withOfficership, participantTypes] = await Promise.all([
    attachOfficership(userDto),
    listParticipantTypes(userDto.id),
  ])
  return { ...withOfficership, participantTypes }
}

export async function getCurrentUser(userId) {
  const user = await findUserById(userId)
  if (!user) {
    throw new ApiError(404, 'User not found')
  }
  return attachParticipantContext(sanitizeUser(user))
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await findUserById(userId)
  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  const valid = await comparePassword(currentPassword, user.password)
  if (!valid) {
    throw new ApiError(401, 'Current password is incorrect')
  }

  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from current password')
  }

  await updateUserPassword(userId, newPassword, { clearMustChange: true })
  await incrementTokenVersion(userId)
  const refreshed = await findUserById(userId)
  return sanitizeUser(refreshed)
}

/**
 * Skip password change for users who have must_change_password = true.
 * This allows voters and organizers to keep their temporary password.
 * Admin accounts are excluded (admin uses username-based auth).
 */
export async function skipPasswordChange(userId) {
  const user = await findUserById(userId)
  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  // Only allow voters and organizers to skip - admins must change their password
  if (user.role === USER_ROLES.ADMIN) {
    throw new ApiError(403, 'Password change is required for your account type')
  }

  // Check if user actually has must_change_password = true
  if (!user.must_change_password) {
    throw new ApiError(400, 'Password change is not required for your account')
  }

  // Clear the must_change_password flag without changing the password
  const { data, error } = await db()
    .from(DB_TABLES.USERS)
    .update({ must_change_password: false })
    .eq('id', userId)
    .select('*')
    .single()

  if (error) {
    throw new ApiError(500, 'Failed to update password status')
  }

  return sanitizeUser(data)
}
