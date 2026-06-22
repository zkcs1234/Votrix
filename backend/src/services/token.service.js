import { signAccessToken, signRefreshToken } from '../utils/jwt.js'
import { sanitizeUser } from '../utils/userMapper.js'

export function buildTokenPayload(user) {
  return {
    sub: user.id,
    role: user.role,
    username: user.username ?? undefined,
    email: user.email ?? undefined,
    accountStatus: user.account_status ?? 'active',
    mustChangePassword: Boolean(user.must_change_password),
    tokenVersion: Number(user.token_version ?? 0),
  }
}

export function issueTokenPair(userRow) {
  const payload = buildTokenPayload(userRow)
  const user = sanitizeUser(userRow)

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user,
  }
}
