import { ApiError } from '../utils/ApiError.js'
import { MAX_INVITATION_EXPIRY_DAYS, ORGANIZER_ORGANIZATION_TYPES, ORGANIZER_SCOPE_TYPES } from '../utils/constants.js'
import { buildScope, splitMulti, programMatchers } from '../services/admin-organizer.service.js'

import { EMAIL_RE, FORM_LIMITS } from '../../../shared/form-rules.js'

const MAX_TEXT = FORM_LIMITS.text

export const MAX_INVITATION_NOTE = FORM_LIMITS.invitationNote
export const DEFAULT_INVITATION_EXPIRY_DAYS = 7
export { MAX_INVITATION_EXPIRY_DAYS }
export const MAX_DECLINE_REASON = 1000

// Multipart bodies deliver arrays as JSON strings or delimited text; JSON
// bodies deliver real arrays. Accept all three.
export function toStringList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  const text = String(value ?? '').trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean)
    } catch {
      // fall through to delimited parsing
    }
  }
  return splitMulti(text)
}

function requiredText(value, label, errors) {
  const text = String(value ?? '').trim()
  if (!text) {
    errors.push(`${label} is required`)
    return ''
  }
  if (text.length > MAX_TEXT) {
    errors.push(`${label} must be ${MAX_TEXT} characters or fewer`)
    return ''
  }
  return text
}

/**
 * Validate and normalise the organizer profile + requested scope. Used for the
 * applicant's submission (strict organization type) and for the admin's
 * corrections at review time (any non-empty organization type, since the
 * admin-created accounts already allow free text).
 *
 * Scope reuses the exact buildScope() that admin organizer registration uses,
 * so applications can never produce a scope shape the rest of the system does
 * not understand.
 */
export function validateApplicationFields(raw, programList, { strictOrganizationType = true } = {}) {
  const errors = []
  const organizerName = requiredText(raw?.organizerName, 'organizer name', errors)
  const position = requiredText(raw?.position, 'position', errors)
  const organizationName = requiredText(raw?.organizationName, 'organization name', errors)

  let organizationType = requiredText(raw?.organizationType, 'organization type', errors)
  if (organizationType && strictOrganizationType) {
    const canonical = ORGANIZER_ORGANIZATION_TYPES.find(
      (t) => t.toLowerCase() === organizationType.toLowerCase(),
    )
    if (!canonical) {
      errors.push(`organization type must be one of: ${ORGANIZER_ORGANIZATION_TYPES.join(', ')}`)
      organizationType = ''
    } else {
      organizationType = canonical
    }
  }

  const scopeType = String(raw?.scopeType ?? '').trim().toLowerCase()
  if (scopeType !== ORGANIZER_SCOPE_TYPES.ALL && scopeType !== ORGANIZER_SCOPE_TYPES.SCOPED) {
    errors.push('access scope must be "all" or "scoped"')
  }
  const { scope, errors: scopeErrors } = buildScope(
    {
      scopeTypeRaw: scopeType,
      programsRaw: toStringList(raw?.programs),
    },
    programMatchers(programList),
  )
  errors.push(...scopeErrors)

  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })
  return { organizerName, position, organizationName, organizationType, scope }
}

/**
 * `defaultExpiryDays` is the admin-configured default (System settings); it applies
 * when the request does not name an expiry.
 */
export function validateInvitationInput(raw, defaultExpiryDays = DEFAULT_INVITATION_EXPIRY_DAYS) {
  const errors = []
  const email = String(raw?.email ?? '').trim().toLowerCase()
  if (!email) errors.push('email is required')
  else if (!EMAIL_RE.test(email) || email.length > MAX_TEXT) errors.push('invalid email')

  let expiresInDays = defaultExpiryDays
  if (raw?.expiresInDays !== undefined && raw?.expiresInDays !== null && raw?.expiresInDays !== '') {
    const n = Number(raw.expiresInDays)
    if (!Number.isInteger(n) || n < 1 || n > MAX_INVITATION_EXPIRY_DAYS) {
      errors.push(`expiry must be a whole number of days between 1 and ${MAX_INVITATION_EXPIRY_DAYS}`)
    } else {
      expiresInDays = n
    }
  }

  const note = String(raw?.note ?? '').trim()
  if (note.length > MAX_INVITATION_NOTE) errors.push(`note must be ${MAX_INVITATION_NOTE} characters or fewer`)

  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })
  return { email, expiresInDays, note: note || null }
}

export function validateDeclineReason(raw) {
  const reason = String(raw ?? '').trim()
  if (!reason) throw new ApiError(400, 'Validation failed', { errors: ['a decline reason is required'] })
  if (reason.length > MAX_DECLINE_REASON) {
    throw new ApiError(400, 'Validation failed', { errors: [`reason must be ${MAX_DECLINE_REASON} characters or fewer`] })
  }
  return reason
}
