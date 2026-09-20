import { ApiError } from './ApiError.js'
import { EVENT_STATUS } from './constants.js'

const RESTRICTED_STATUSES = new Set([
  EVENT_STATUS.ACTIVE,
  EVENT_STATUS.COMPLETED,
  EVENT_STATUS.CANCELLED,
  EVENT_STATUS.ARCHIVED,
])

const CORE_FIELD_KEYS = new Set(['title', 'description', 'banner', 'startDate', 'endDate'])

export function assertEventUpdateAllowed(event, updates = {}) {
  if (!event) return

  const status = event.status
  if (!status || !RESTRICTED_STATUSES.has(status)) return

  const hasCoreFieldUpdate = Object.keys(updates || {}).some((key) => CORE_FIELD_KEYS.has(key))
  if (!hasCoreFieldUpdate) return

  throw new ApiError(400, 'This event cannot be edited because it is already active, completed, or cancelled')
}

// Staged edit-locking (see SYSTEM_ENHANCEMENTS_IMPLEMENTATION_PLAN.md, Point 1).
// Setup content is editable only while the event is a `draft`; publishing locks
// it (the organizer unpublishes back to draft to correct it). Participant
// rosters stay editable through `scheduled` and lock once `active`.
const SETUP_EDITABLE_STATUSES = new Set([EVENT_STATUS.DRAFT])

// Feature flag — see PARTICIPANT_LOCK_FEATURE_FLAG.md.
// Default (unset / anything but "false") = PRODUCTION: the participant roster
// (voters / judges / respondents) locks once the event is ACTIVE.
// Set env LOCK_PARTICIPANTS_ON_ACTIVE=false to keep the roster editable through
// the active state during testing. No locking code is removed — flip the env
// back (or unset it) to restore the production lock.
const LOCK_PARTICIPANTS_ON_ACTIVE = process.env.LOCK_PARTICIPANTS_ON_ACTIVE !== 'false'

const PARTICIPANTS_EDITABLE_STATUSES = new Set(
  LOCK_PARTICIPANTS_ON_ACTIVE
    ? [EVENT_STATUS.DRAFT, EVENT_STATUS.SCHEDULED]
    : [EVENT_STATUS.DRAFT, EVENT_STATUS.SCHEDULED, EVENT_STATUS.ACTIVE],
)

export function isSetupLocked(status) {
  return !SETUP_EDITABLE_STATUSES.has(status)
}

export function isParticipantsLocked(status) {
  return !PARTICIPANTS_EDITABLE_STATUSES.has(status)
}

export function canUnpublishEventStatus(status) {
  return status === EVENT_STATUS.SCHEDULED
}

// Guard for setup mutations (positions, candidates, structure, questions,
// details, branding, information form). Throws 409 once the event is published.
export function assertSetupEditable(event) {
  if (!event) return
  if (isSetupLocked(event.status)) {
    throw new ApiError(
      409,
      'This event is published. Unpublish it back to draft before editing its setup.',
    )
  }
}

// Guard for participant-roster mutations (register / invite / import / resend).
// Throws 409 once voting or scoring is open.
export function assertParticipantsEditable(event) {
  if (!event) return
  if (isParticipantsLocked(event.status)) {
    throw new ApiError(
      409,
      'This event is active — the participant roster is locked and can no longer be changed.',
    )
  }
}
