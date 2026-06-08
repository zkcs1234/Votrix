// Phase 9 — refactored to use the shared `foundation/` helpers.
// Behaviour and the exported surface are unchanged.

import { db, wrap } from '../foundation/db.js'
import { conflict, notFound } from '../foundation/errors.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'
import { hashPassword } from '../utils/password.js'
import { sanitizeUser } from '../utils/userMapper.js'

export async function findUserByUsername(username) {
  const result = await db()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('username', username)
    .eq('role', USER_ROLES.ADMIN)
    .maybeSingle()
  return wrap(result, { context: 'user.findUserByUsername' })
}

export async function findUserByEmail(email, role) {
  let query = db()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('email', email.toLowerCase())

  if (role) {
    query = query.eq('role', role)
  }

  const result = await query.maybeSingle()
  return wrap(result, { context: 'user.findUserByEmail' })
}

export async function findUserById(id) {
  const result = await db()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return wrap(result, { context: 'user.findUserById' })
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
    throw conflict('An account with this email already exists')
  }

  const passwordHash = await hashPassword(password)

  const data = await wrap(
    db()
      .from(DB_TABLES.USERS)
      .insert({
        email: normalizedEmail,
        password: passwordHash,
        role: USER_ROLES.ORGANIZER,
        account_status: 'pending',
        must_change_password: mustChangePassword,
      })
      .select('*')
      .single(),
    { context: 'user.createOrganizer' },
  )

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
  console.log('[DEBUG updateUserPassword] userId =', userId, 'type =', typeof userId)
  const passwordHash = await hashPassword(newPassword)

  const updates = { password: passwordHash }
  if (clearMustChange) {
    updates.must_change_password = false
  }

  console.log('[DEBUG updateUserPassword] executing update query...')
  const query = db()
    .from(DB_TABLES.USERS)
    .update(updates)
    .eq('id', userId)
    .select('*')
    .single()
  console.log('[DEBUG updateUserPassword] awaiting query...')
  const result = await query
  console.log('[DEBUG updateUserPassword] result =', result)

  const data = await wrap(result, { context: 'user.updateUserPassword' })
  if (!data) throw notFound('User not found')
  return sanitizeUser(data)
}

export { sanitizeUser }
