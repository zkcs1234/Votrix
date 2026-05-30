import crypto from 'crypto'

export function generateTemporaryPassword(length = 12) {
  const raw = crypto.randomBytes(9).toString('base64url')
  return raw.slice(0, length)
}

export function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}
