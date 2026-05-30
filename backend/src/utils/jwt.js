import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
}

export function signAccessToken(payload) {
  return jwt.sign(
    { ...payload, type: TOKEN_TYPES.ACCESS },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn },
  )
}

export function signRefreshToken(payload) {
  return jwt.sign(
    { sub: payload.sub, role: payload.role, type: TOKEN_TYPES.REFRESH },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn },
  )
}

export function verifyAccessToken(token) {
  const decoded = jwt.verify(token, env.jwt.accessSecret)
  if (decoded.type !== TOKEN_TYPES.ACCESS) {
    throw new jwt.JsonWebTokenError('Invalid token type')
  }
  return decoded
}

export function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, env.jwt.refreshSecret)
  if (decoded.type !== TOKEN_TYPES.REFRESH) {
    throw new jwt.JsonWebTokenError('Invalid token type')
  }
  return decoded
}
