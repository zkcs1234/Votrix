import { ApiError } from '../utils/ApiError.js'
import { comparePassword } from '../utils/password.js'
import { USER_ROLES } from '../utils/constants.js'
import {
  findUserByUsername,
  findUserByEmail,
  findUserById,
  updateUserPassword,
  sanitizeUser,
} from './user.service.js'
import { issueTokenPair } from './token.service.js'

async function loginWithCredentials({ findUser, identifier, password, invalidMessage }) {
  const user = await findUser(identifier)

  if (!user) {
    throw new ApiError(401, invalidMessage)
  }

  const valid = await comparePassword(password, user.password)
  if (!valid) {
    throw new ApiError(401, invalidMessage)
  }

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

export async function refreshSession(userId) {
  const user = await findUserById(userId)
  if (!user) {
    throw new ApiError(401, 'User not found')
  }
  return issueTokenPair(user)
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

  return updateUserPassword(userId, newPassword, { clearMustChange: true })
}
