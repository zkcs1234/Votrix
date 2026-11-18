import { ApiError } from './ApiError.js'
import { EVENT_STATUS } from './constants.js'

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

// Publishing an event whose end date is already in the past would send it
// straight to "completed" without ever opening. Reject it with a clear message.
export function assertEndDateNotPassed(event, noun = 'event', now = new Date()) {
  const end = event?.end_date ?? event?.endDate
  if (end && new Date(end).getTime() < now.getTime()) {
    throw new ApiError(
      400,
      `This ${noun}'s end date has already passed. Move the end date to the future before publishing.`,
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

// ---------------------------------------------------------------------------
// Published-event edit policy
//
// A published event (scheduled / active) is not frozen solid: an organizer who
// spots a mistake can still correct low-risk content, and can extend the
// schedule, as long as they give a reason (written to the audit trail).
// Anything that could change the outcome stays locked.
//
//   safe       title, description, banner  → editable while scheduled or active
//   schedule   start / end / poll expiry   → scheduled: any future date;
//                                             active: end date may only be extended
//   integrity  everything else             → locked; unpublish (scheduled) or
//                                             pause and revise (active, no activity)
//
// Edits are classified by what actually changed against the stored event, not by
// which keys the client sent, because the forms resubmit every field.
// ---------------------------------------------------------------------------

export const EDIT_CLASS = {
  SAFE: 'safe',
  SCHEDULE: 'schedule',
  INTEGRITY: 'integrity',
}

// payload key -> { column on `events`, class, date? }
const EDITABLE_FIELDS = {
  title: { column: 'title', cls: EDIT_CLASS.SAFE },
  description: { column: 'description', cls: EDIT_CLASS.SAFE },
  banner: { column: 'banner', cls: EDIT_CLASS.SAFE },
  image_asset_id: { column: 'image_asset_id', cls: EDIT_CLASS.SAFE },
  startDate: { column: 'start_date', cls: EDIT_CLASS.SCHEDULE, date: true },
  endDate: { column: 'end_date', cls: EDIT_CLASS.SCHEDULE, date: true },
  pollExpiresAt: { column: 'poll_expires_at', cls: EDIT_CLASS.SCHEDULE, date: true },
  resultsVisibility: { column: 'results_visibility', cls: EDIT_CLASS.INTEGRITY },
  competitionType: { column: 'competition_type', cls: EDIT_CLASS.INTEGRITY },
  pollAnonymous: { column: 'poll_anonymous', cls: EDIT_CLASS.INTEGRITY },
  pollAllowMultipleSubmissions: { column: 'poll_allow_multiple_submissions', cls: EDIT_CLASS.INTEGRITY },
  status: { column: 'status', cls: EDIT_CLASS.INTEGRITY },
}

const PUBLISHED_STATUSES = new Set([EVENT_STATUS.SCHEDULED, EVENT_STATUS.ACTIVE])
const TERMINAL_STATUSES = new Set([
  EVENT_STATUS.COMPLETED,
  EVENT_STATUS.CANCELLED,
  EVENT_STATUS.ARCHIVED,
])

export const MIN_CHANGE_REASON_LENGTH = 5
export const MAX_CHANGE_REASON_LENGTH = 500

const isBlank = (value) => value === undefined || value === null || value === ''

function sameValue(field, current, next) {
  if (isBlank(current) && isBlank(next)) return true
  if (isBlank(current) || isBlank(next)) return false
  if (field.date) return new Date(current).getTime() === new Date(next).getTime()
  return current === next
}

/**
 * Compare an update payload with the stored event and return only the fields
 * that actually change, tagged with their edit class.
 */
export function getEventChanges(event, payload = {}) {
  const changes = []
  for (const [key, field] of Object.entries(EDITABLE_FIELDS)) {
    if (payload[key] === undefined) continue
    const from = event?.[field.column] ?? null
    const to = isBlank(payload[key]) ? null : payload[key]
    if (sameValue(field, from, to)) continue
    changes.push({ key, cls: field.cls, from, to })
  }
  return changes
}

// Compact { field: [from, to] } object for audit logs.
export function summarizeChanges(changes) {
  const clip = (value) =>
    typeof value === 'string' && value.length > 200 ? `${value.slice(0, 200)}…` : value
  return Object.fromEntries(changes.map((c) => [c.key, [clip(c.from), clip(c.to)]]))
}

export function normalizeChangeReason(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function validateChangeReasonShape(value) {
  if (value === undefined || value === null) return undefined
  const reason = normalizeChangeReason(value)
  if (reason.length > MAX_CHANGE_REASON_LENGTH) {
    throw new ApiError(400, `Reason must be ${MAX_CHANGE_REASON_LENGTH} characters or fewer`)
  }
  return reason
}

export function assertChangeReason(reason, what = 'change a published event') {
  if (normalizeChangeReason(reason).length < MIN_CHANGE_REASON_LENGTH) {
    throw new ApiError(
      400,
      `A reason (at least ${MIN_CHANGE_REASON_LENGTH} characters) is required to ${what}.`,
    )
  }
}

/**
 * Guard for event-detail updates across all statuses. Returns the list of real
 * changes so the caller can write the audit diff.
 *
 *  draft      → anything goes, no reason needed
 *  scheduled  → safe + schedule changes with a reason; integrity changes → 409
 *  active     → safe changes and end-date extension with a reason; the rest → 409
 *  terminal   → any change → 409
 */
export function assertPublishedEventUpdate(event, payload = {}, { now = new Date() } = {}) {
  if (!event) return []
  const changes = getEventChanges(event, payload)
  if (changes.length === 0) return changes

  const status = event.status

  if (status === EVENT_STATUS.DRAFT || !status) return changes

  if (TERMINAL_STATUSES.has(status)) {
    throw new ApiError(409, `This event is ${status} and can no longer be edited.`)
  }
  if (!PUBLISHED_STATUSES.has(status)) return changes

  const integrity = changes.filter((c) => c.cls === EDIT_CLASS.INTEGRITY)
  if (integrity.length > 0) {
    const names = integrity.map((c) => c.key).join(', ')
    throw new ApiError(
      409,
      status === EVENT_STATUS.SCHEDULED
        ? `This event is published. Unpublish it back to draft before changing: ${names}.`
        : `This event is live. These settings can no longer be changed: ${names}. If nobody has voted or responded yet you can pause the event and revise it.`,
    )
  }

  for (const change of changes.filter((c) => c.cls === EDIT_CLASS.SCHEDULE)) {
    const next = change.to ? new Date(change.to) : null
    const prev = change.from ? new Date(change.from) : null

    if (next && Number.isNaN(next.getTime())) {
      throw new ApiError(400, `Invalid date for ${change.key}`)
    }

    if (status === EVENT_STATUS.SCHEDULED) {
      if (change.key !== 'pollExpiresAt' && next && next <= now) {
        throw new ApiError(400, 'A published event must be scheduled for a future date and time.')
      }
      continue
    }

    // active
    if (change.key === 'startDate') {
      throw new ApiError(409, 'The start date cannot be changed once the event is live.')
    }
    if (change.key === 'endDate') {
      if (!next || (prev && next <= prev) || next <= now) {
        throw new ApiError(
          409,
          'A live event can only be extended: the new end date must be later than the current one.',
        )
      }
    }
    if (change.key === 'pollExpiresAt') {
      // Clearing the expiry (no deadline) or moving it later is an extension.
      if (next && (!prev || next <= prev)) {
        throw new ApiError(409, 'A live poll expiry can only be moved later or removed.')
      }
    }
  }

  assertChangeReason(payload.changeReason)
  return changes
}

/**
 * What the frontend may offer for an event right now. `hasActivity` is the
 * module's own answer to "has anyone voted / responded / been scored yet".
 */
export function buildEditPolicy(event, { hasActivity = false, supportsPause = true } = {}) {
  const status = event?.status
  const isDraft = status === EVENT_STATUS.DRAFT
  const isScheduled = status === EVENT_STATUS.SCHEDULED
  const isActive = status === EVENT_STATUS.ACTIVE
  const published = isScheduled || isActive

  const liveFields = []
  if (published) liveFields.push('title', 'description', 'banner')
  if (isScheduled) liveFields.push('startDate', 'endDate', 'pollExpiresAt')
  if (isActive) liveFields.push('endDate', 'pollExpiresAt')

  return {
    status,
    setupLocked: isSetupLocked(status),
    reasonRequired: published,
    liveEditableFields: liveFields,
    endDateExtendOnly: isActive,
    canUnpublish: canUnpublishEventStatus(status),
    canPauseRevise: Boolean(isActive && supportsPause && !hasActivity),
    hasActivity: Boolean(hasActivity),
    isTerminal: TERMINAL_STATUSES.has(status),
  }
}

export function assertEventOperational(event) {
  if (event?.status === EVENT_STATUS.ARCHIVED) {
    throw new ApiError(
      409,
      'This event has been archived and is no longer accepting activity.',
    )
  }
}
