import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { generateSecureToken, hashToken } from '../utils/crypto.js'
import { findUserByEmail } from './user.service.js'
import { updateUserPassword } from './user.service.js'
import { sendPasswordResetEmail } from './mailer.service.js'
import { env } from '../config/env.js'

const RESET_EXPIRY_MINUTES = Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 60
const TABLE = 'password_reset_tokens'

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

export async function requestPasswordReset(email) {
  const normalizedEmail = email.toLowerCase().trim()
  const user = await findUserByEmail(normalizedEmail)

  // Always return success to avoid email enumeration
  const genericResponse = {
    success: true,
    message: 'If an account exists for this email, a reset link has been sent.',
  }

  if (!user || user.role === 'admin') {
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

  await updateUserPassword(row.user_id, newPassword, { clearMustChange: false })

  await getClient()
    .from(TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)

  return { success: true, message: 'Password has been reset. You can sign in now.' }
}
