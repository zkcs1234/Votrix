import { signAccessToken, signRefreshToken } from '../utils/jwt.js'
import { sanitizeUser } from '../utils/userMapper.js'

export function buildTokenPayload(user) {
  return {
    sub: user.id,
    role: user.role,
    username: user.username ?? undefined,
    email: user.email ?? undefined,
    mustChangePassword: Boolean(user.must_change_password),
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
