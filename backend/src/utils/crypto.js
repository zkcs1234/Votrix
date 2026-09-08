import crypto from 'crypto'

// Unambiguous alphabet — omits look-alike characters (0/O, 1/l/I) so a temp
// password can be read from an email and typed without mistakes.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TEMP_PASSWORD_PREFIX = 'Votrix-'

/**
 * Generate a branded, single-use temporary password, e.g. "Votrix-7K9MQP".
 *
 * The random segment carries all the security: `segmentLength` characters drawn
 * uniformly (crypto.randomInt is unbiased) from a 32-char alphabet, so the
 * default of 6 gives ~30 bits of entropy. The "Votrix-" prefix is a constant
 * and adds no entropy — it only makes the password recognizable and readable.
 *
 * This is safe as a temporary credential because every caller issues it with
 * must_change_password = true (it must be replaced on first login) and login is
 * rate limited. Do not reuse this for long-lived secrets — use
 * generateSecureToken() for those.
 */
export function generateTemporaryPassword(segmentLength = 6) {
  let segment = ''
  for (let i = 0; i < segmentLength; i += 1) {
    segment += TEMP_PASSWORD_ALPHABET[crypto.randomInt(TEMP_PASSWORD_ALPHABET.length)]
  }
  return `${TEMP_PASSWORD_PREFIX}${segment}`
}

export function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}
