import { getErrorMessage } from '@/utils/getErrorMessage'

const upperFirst = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text)

/**
 * The API reports validation problems as free-text strings
 * (`details.errors: ['email is required', 'school id already used']`) rather
 * than per-field codes. This maps each message to a form field by matching the
 * keywords supplied in `fieldMap`, so a server rejection (e.g. a duplicate
 * school ID) lands on the right input instead of a generic banner.
 *
 *   fieldMap = { schoolId: ['school id'], email: ['email'] }
 *
 * Returns the messages that matched a field and the ones that did not (those
 * belong in a form-level alert).
 */
export function mapServerErrors(messages, fieldMap = {}) {
  const fieldErrors = {}
  const unmatched = []

  for (const raw of messages) {
    const text = String(raw ?? '').trim()
    if (!text) continue
    const lower = text.toLowerCase()
    const field = Object.keys(fieldMap).find((name) =>
      fieldMap[name].some((keyword) => lower.includes(keyword.toLowerCase())),
    )
    if (field) {
      fieldErrors[field] ??= upperFirst(text)
    } else {
      unmatched.push(upperFirst(text))
    }
  }

  return { fieldErrors, unmatched }
}

/** Pull the list of validation messages out of an Axios-style error. */
export function extractServerMessages(err) {
  const details = err?.response?.data?.details?.errors
  if (Array.isArray(details) && details.length) return details
  const message = err?.response?.data?.message
  return message ? [message] : []
}

/**
 * Apply a failed request to a react-hook-form instance: field-specific
 * messages are set on their inputs, anything else is returned as a single
 * form-level message (or null when every message found a field).
 */
export function applyServerErrors(err, { setError, fieldMap, fallback = 'Something went wrong' }) {
  const messages = extractServerMessages(err)
  if (!messages.length) return getErrorMessage(err, fallback)

  const { fieldErrors, unmatched } = mapServerErrors(messages, fieldMap)
  let focused = false
  for (const [name, message] of Object.entries(fieldErrors)) {
    setError(name, { type: 'server', message }, { shouldFocus: !focused })
    focused = true
  }
  return unmatched.length ? unmatched.join('; ') : null
}
