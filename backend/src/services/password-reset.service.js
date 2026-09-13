import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { generateSecureToken, hashToken } from '../utils/crypto.js'
import { findUserByEmail } from './user.service.js'
import { updateUserPassword, incrementTokenVersion } from './user.service.js'
import { revokeAllSessionsForUser } from './session.service.js'
import { sendPasswordResetEmail } from './mailer.service.js'
import { env } from '../config/env.js'
import { recordAudit } from '../foundation/audit.js'

const RESET_EXPIRY_MINUTES = Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 60
const TABLE = 'password_reset_tokens'


export async function requestPasswordReset(email) {
  const normalizedEmail = email.toLowerCase().trim()
  const user = await findUserByEmail(normalizedEmail)

  // Always return success to avoid email enumeration
  const genericResponse = {
    success: true,
    message: 'If an account exists for this email, a reset link has been sent.',
  }

  if (!user || user.role === 'admin') {
    // Audit the attempt even when no eligible account exists — useful for
    // spotting reset-abuse. userId is null since no account is acted upon.
    recordAudit({
      userId: null,
      action: 'auth.password_reset.request',
      entity: 'users',
      details: { email: normalizedEmail, accountFound: false },
    })
    return { ...genericResponse, emailSent: false }
  }

  const rawToken = generateSecureToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000).toISOString()

  await getClient().from(TABLE).delete().eq('user_id', user.id).is('used_at', null)

  const { error } = await getClient().from(TABLE).insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })

  if (error) throw new ApiError(500, error.message)

  const emailResult = await sendPasswordResetEmail({
    email: normalizedEmail,
    token: rawToken,
    expiresInMinutes: RESET_EXPIRY_MINUTES,
  })

  recordAudit({
    userId: user.id,
    action: 'auth.password_reset.request',
    entity: 'users',
    entityId: user.id,
    details: { email: normalizedEmail, accountFound: true, emailSent: emailResult.sent },
  })

  return { ...genericResponse, emailSent: emailResult.sent }
}

export async function resetPasswordWithToken({ token, newPassword }) {
  const tokenHash = hashToken(token)

  const { data: row, error } = await getClient()
    .from(TABLE)
    .select('*')
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)

  if (!row || new Date(row.expires_at) < new Date()) {
    throw new ApiError(400, 'Invalid or expired reset token')
  }

  // Setting a real password via the reset link fully replaces the account
  // password — including any temporary one from an invitation — so clear the
  // must_change_password flag. Otherwise an invited voter/judge who recovers
  // through this flow would still be force-prompted to change it on first login.
  await updateUserPassword(row.user_id, newPassword, { clearMustChange: true })
  await incrementTokenVersion(row.user_id)

  // The token_version bump invalidated every existing token; drop the now-dead
  // session rows so they don't linger as "active" in admin session management.
  try {
    await revokeAllSessionsForUser(row.user_id)
  } catch {
    // Best-effort cleanup — never block a password reset.
  }

  await getClient()
    .from(TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)

  recordAudit({
    userId: row.user_id,
    action: 'auth.password_reset.complete',
    entity: 'users',
    entityId: row.user_id,
  })

  return { success: true, message: 'Password has been reset. You can sign in now.' }
}
