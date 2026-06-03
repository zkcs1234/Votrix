import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'
import { hashPassword } from '../utils/password.js'
import { sanitizeUser } from '../utils/userMapper.js'

function getClient() {
  const client = getSupabase()
  if (!client) {
    throw new ApiError(503, 'Database is not configured')
  }
  return client
}

export async function findUserByUsername(username) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('username', username)
    .eq('role', USER_ROLES.ADMIN)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function findUserByEmail(email, role) {
  let query = getClient().from(DB_TABLES.USERS).select('*').eq('email', email.toLowerCase())

  if (role) {
    query = query.eq('role', role)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function findUserById(id) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function createOrganizer({
  email,
  password,
  mustChangePassword = true,
  sendInvitationEmail = true,
}) {
  const normalizedEmail = email.toLowerCase().trim()
  const existing = await findUserByEmail(normalizedEmail)

  if (existing) {
    throw new ApiError(409, 'An account with this email already exists')
  }

  const passwordHash = await hashPassword(password)

  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .insert({
      email: normalizedEmail,
      password: passwordHash,
      role: USER_ROLES.ORGANIZER,
      account_status: 'pending',
      must_change_password: mustChangePassword,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const user = sanitizeUser(data)
  let emailResult = { sent: false, skipped: true }

  if (sendInvitationEmail) {
    const { sendOrganizerInvitationEmail } = await import('./mailer.service.js')
    emailResult = await sendOrganizerInvitationEmail({
      email: normalizedEmail,
      temporaryPassword: password,
    })
  }

  return { user, email: emailResult }
}

export async function updateUserPassword(userId, newPassword, { clearMustChange = true } = {}) {
  const passwordHash = await hashPassword(newPassword)

  const updates = { password: passwordHash }
  if (clearMustChange) {
    updates.must_change_password = false
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .update(updates)
    .eq('id', userId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return sanitizeUser(data)
}

export { sanitizeUser }
