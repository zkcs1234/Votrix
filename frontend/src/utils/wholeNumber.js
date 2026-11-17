/**
 * Validates text from a number input as a whole number within [min, max].
 * Returns an error message, or null when valid. `label` names the field in the
 * message ("Threshold (count)").
 */
export function wholeNumberInRange(raw, { label, min = 1, max }) {
  const text = String(raw ?? '').trim()
  const n = Number(text)
  if (text === '' || Number.isNaN(n)) return `${label} must be a valid number`
  if (!Number.isInteger(n) || n < min || n > max) {
    return `${label} must be a whole number from ${min} to ${max}`
  }
  return null
}
