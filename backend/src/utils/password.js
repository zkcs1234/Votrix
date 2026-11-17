import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

/**
 * Passwords are text, even when every character is a digit. A client (or a proxy in
 * front of it) that sends an all-digit password as a JSON number would otherwise sail
 * through the length check (a number has no `.length`) and then crash inside bcrypt.
 * This returns the password as a string, or `undefined` when the value cannot be one
 * (so the caller can answer 400 instead of failing deep in hashing).
 */
export function normalizePasswordInput(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  return undefined
}
