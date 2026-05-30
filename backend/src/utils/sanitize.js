/**
 * Strip HTML tags and trim user-provided strings before persistence.
 */
export function sanitizeString(value, maxLength = 10_000) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'string') return value

  const cleaned = value
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/\0/g, '')

  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned
}

export function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return email
  return sanitizeString(email, 320).toLowerCase()
}
