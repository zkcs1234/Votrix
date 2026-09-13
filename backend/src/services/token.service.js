import { signAccessToken, signRefreshToken } from '../utils/jwt.js'
import { sanitizeUser } from '../utils/userMapper.js'

export function buildTokenPayload(user, { sessionId } = {}) {
  const payload = {
    sub: user.id,
    role: user.role,
    username: user.username ?? undefined,
    email: user.email ?? undefined,
    accountStatus: user.account_status ?? 'active',
    mustChangePassword: Boolean(user.must_change_password),
    tokenVersion: Number(user.token_version ?? 0),
  }
  // `sid` binds the token to a row in `user_sessions` so a single session can
  // be revoked individually. Omitted when session tracking is unavailable.
  if (sessionId) payload.sid = sessionId
  return payload
}

export function issueTokenPair(userRow, { sessionId } = {}) {
  const payload = buildTokenPayload(userRow, { sessionId })
  const user = sanitizeUser(userRow)

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user,
  }
}
