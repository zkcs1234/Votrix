import { USER_ROLES, isParticipantRole } from '@/utils/constants'

// A student officer is a participant account the organizer has assigned to work
// inside the organizer workspace as that organizer. The server sends
// `user.officership` ({ organizerId, organizationName, organizerName, position })
// for participants, or null. It only drives what the UI offers: the backend
// re-checks the officership on every organizer request.

const ORGANIZER_PATH = /^\/organizer(\/|$)/

export function getOfficership(user) {
  return user?.officership?.organizerId ? user.officership : null
}

/** True for an active student officer (never for a real organizer or admin). */
export function isOfficer(user) {
  return isParticipantRole(user?.role) && Boolean(getOfficership(user))
}

/** Real organizers and active officers may use the organizer workspace. */
export function canUseOrganizerWorkspace(user) {
  return user?.role === USER_ROLES.ORGANIZER || isOfficer(user)
}

export function isOrganizerPath(pathname) {
  return ORGANIZER_PATH.test(pathname ?? '')
}

/**
 * The role the current page should be rendered for. An officer is a
 * `participant` everywhere except inside `/organizer`, where the existing
 * organizer layouts, navigation and search apply unchanged.
 */
export function effectiveWorkspaceRole(user, pathname) {
  if (isOfficer(user) && isOrganizerPath(pathname)) return USER_ROLES.ORGANIZER
  return user?.role ?? null
}

/** Compare two officership payloads (null-safe) to detect a change. */
export function sameOfficership(a, b) {
  const x = a?.organizerId ? a : null
  const y = b?.organizerId ? b : null
  if (!x || !y) return x === y
  return x.organizerId === y.organizerId && x.position === y.position && x.organizationName === y.organizationName
}

// ---------------------------------------------------------------------------
// Participant account kind. The server sends `user.participantTypes`
// (['STUDENT'] or ['JUDGE']; an account is one or the other). It only labels the
// UI; access is always checked per event on the server.
// ---------------------------------------------------------------------------

export function getParticipantTypes(user) {
  return Array.isArray(user?.participantTypes) ? user.participantTypes : []
}

/** 'judge' | 'student' | 'participant' (unknown or not loaded yet). */
export function participantKind(user) {
  const types = getParticipantTypes(user)
  if (types.includes('JUDGE') && !types.includes('STUDENT')) return 'judge'
  if (types.includes('STUDENT') && !types.includes('JUDGE')) return 'student'
  return 'participant'
}

const KIND_LABELS = { judge: 'Judge', student: 'Student', participant: 'Participant' }

/**
 * Short label for the account chip in the header, or null when the account is
 * not a participant (the caller falls back to its own role labels).
 */
export function participantChipLabel(user, inOfficerWorkspace = false) {
  if (!isParticipantRole(user?.role)) return null
  if (inOfficerWorkspace) return 'Officer'
  const label = KIND_LABELS[participantKind(user)]
  return isOfficer(user) ? `${label} · Officer` : label
}

/** Compare the parts of the participant context the UI depends on. */
export function sameParticipantContext(a, b) {
  return (
    sameOfficership(a?.officership, b?.officership) &&
    getParticipantTypes(a).join(',') === getParticipantTypes(b).join(',')
  )
}
