import { ApiError } from '../utils/ApiError.js'
import { comparePassword } from '../utils/password.js'
import { USER_ROLES } from '../utils/constants.js'
import {
  findUserByUsername,
  findUserByEmail,
  findUserById,
  updateUserPassword,
  incrementTokenVersion,
  sanitizeUser,
} from './user.service.js'
import { issueTokenPair } from './token.service.js'

function assertAccountActive(user) {
  if (user?.account_status === 'active') return

  if (user?.account_status === 'pending') {
    throw new ApiError(403, 'Your account is pending approval')
  }

  if (user?.account_status === 'suspended') {
    throw new ApiError(403, 'Your account has been suspended')
  }

  if (user?.account_status === 'archived') {
    throw new ApiError(403, 'Your account is archived')
  }

  throw new ApiError(403, 'Your account is not active')
}

async function loginWithCredentials({ findUser, identifier, password, invalidMessage }) {
  const user = await findUser(identifier)

  if (!user) {
    throw new ApiError(401, invalidMessage)
  }

  const valid = await comparePassword(password, user.password)
  if (!valid) {
    throw new ApiError(401, invalidMessage)
  }

  assertAccountActive(user)

  return issueTokenPair(user)
}

export async function loginAdmin({ username, password }) {
  return loginWithCredentials({
    findUser: (u) => findUserByUsername(u.trim()),
    identifier: username,
    password,
    invalidMessage: 'Invalid username or password',
  })
}

export async function loginOrganizer({ email, password }) {
  return loginWithCredentials({
    findUser: (e) => findUserByEmail(e, USER_ROLES.ORGANIZER),
    identifier: email,
    password,
    invalidMessage: 'Invalid email or password',
  })
}

export async function loginVoter({ email, password }) {
  return loginWithCredentials({
    findUser: (e) => findUserByEmail(e, USER_ROLES.VOTER),
    identifier: email,
    password,
    invalidMessage: 'Invalid email or password',
  })
}

export async function refreshSession(userId, tokenVersion) {
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
  return issueTokenPair(user)
}

export async function issueSessionForUser(userId) {
  const user = await findUserById(userId)
  if (!user) {
    throw new ApiError(401, 'User not found')
  }
  assertAccountActive(user)
  return issueTokenPair(user)
}

export async function revokeSession(userId) {
  return incrementTokenVersion(userId)
}

export async function getCurrentUser(userId) {
  const user = await findUserById(userId)
  if (!user) {
    throw new ApiError(404, 'User not found')
  }
  return sanitizeUser(user)
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
