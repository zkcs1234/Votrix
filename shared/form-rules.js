// Single source of truth for form-validation rules that both the frontend
// (live, as-you-type feedback) and the backend (the authoritative check) apply.
// Keep this file dependency-free: it is imported by Vite and by Node.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const FORM_LIMITS = Object.freeze({
  /** Generic single-line text (names, positions, organisation names). */
  text: 255,
  eventTitle: 200,
  description: 2000,
  invitationNote: 500,
  declineReason: 1000,
  notification: 2000,
  passwordMin: 8,
  invitationExpiryMinDays: 1,
  invitationExpiryMaxDays: 30,
  alertThresholdMax: 100000,
})

export function isBlank(value) {
  return value == null || String(value).trim() === ''
}

export function isEmail(value) {
  const text = String(value ?? '').trim()
  return text.length > 0 && text.length <= FORM_LIMITS.text && EMAIL_RE.test(text)
}
