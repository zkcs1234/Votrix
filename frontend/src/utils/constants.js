const configuredApiUrl = (import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')

// In production, VITE_API_URL must point at the Render API. Falling back to
// the same-origin '/api' only works when a server-side proxy (vercel.json
// rewrites, a Vite dev proxy, or a reverse proxy) is configured to forward
// those calls to the API. We default to the configured URL so misconfigured
// deploys fail loud instead of silently hitting the wrong host.
export const API_BASE_URL = configuredApiUrl

export const USER_ROLES = {
  ADMIN: 'admin',
  ORGANIZER: 'organizer',
  VOTER: 'voter',
}

export const ORG_TYPES = {
  ELECTION: 'election',
  PAGEANT: 'pageant',
  COMPETITION_SCORING: 'competition_scoring',
  POLLING: 'polling',
}

export const ORG_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
}

export const EVENT_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

// Terminal states an organizer can no longer edit: the event is done (or
// called off) so its setup/details are locked and the UI shows a read-only
// "View" instead of "Edit". The backend enforces the same lock on mutations.
export const READ_ONLY_EVENT_STATUSES = new Set([
  EVENT_STATUS.COMPLETED,
  EVENT_STATUS.CANCELLED,
])

export function isReadOnlyEventStatus(status) {
  return READ_ONLY_EVENT_STATUSES.has(status)
}

// Staged edit-locking (see SYSTEM_ENHANCEMENTS_IMPLEMENTATION_PLAN.md, Point 1).
//
// Setup — event details, branding, information form, positions/candidates,
// competition structure, poll questions — is editable only while the event is
// a `draft`. Publishing (draft → scheduled) locks setup; the organizer can
// `unpublish` back to draft while still `scheduled` to make corrections.
//
// Participants — the registered/invited voters, judges, or respondents — stay
// editable through `scheduled` so the organizer can invite in batches within
// email resend limits. They lock once the event is `active` (voting/scoring is
// open) and stay locked in the terminal states.
const SETUP_EDITABLE_STATUSES = new Set([EVENT_STATUS.DRAFT])

// Feature flag — see PARTICIPANT_LOCK_FEATURE_FLAG.md.
// Default (unset / anything but "false") = PRODUCTION: the participant roster
// (voters / judges / respondents) locks once the event is ACTIVE.
// Set VITE_LOCK_PARTICIPANTS_ON_ACTIVE=false in frontend/.env to keep the roster
// editable through the active state during testing (then restart/rebuild). No
// locking code is removed — flip it back (or unset it) to restore the lock.
const LOCK_PARTICIPANTS_ON_ACTIVE =
  import.meta.env.VITE_LOCK_PARTICIPANTS_ON_ACTIVE !== 'false'

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

// An event can be pulled back to `draft` only while it is `scheduled` (published
// but not yet started). Once `active` the schedule owns it and it is one-way.
export function canUnpublishEventStatus(status) {
  return status === EVENT_STATUS.SCHEDULED
}

export const EVENT_TYPES = {
  ELECTION: 'election',
  PAGEANT: 'pageant',
  COMPETITION_SCORING: 'competition_scoring',
  POLLING: 'polling',
}

export const COMPETITION_SCORING_EVENT_TYPES = new Set([
  EVENT_TYPES.PAGEANT,
  EVENT_TYPES.COMPETITION_SCORING,
])

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'votrix_access_token',
  USER: 'votrix_user',
  CSRF_TOKEN: 'votrix_csrf_token',
}
