import { getParticipantTypes } from '@/utils/workspace'

// What a participant's read-only profile says about who they are. Profile details are
// managed by an administrator; this only formats what the server already sends
// (`user.participantTypes` and `user.officership`).

const TYPE_LABELS = { STUDENT: 'Student', JUDGE: 'Judge' }

/** "Student" or "Judge" (both, comma separated, if an account somehow has both); null when unknown. */
export function accountTypeLabel(user) {
  const labels = getParticipantTypes(user).map((type) => TYPE_LABELS[type]).filter(Boolean)
  return labels.length ? labels.join(', ') : null
}

/**
 * Organization membership shown on a student's profile: the organization they are an
 * officer of and their position there. Empty for anyone who is not an officer.
 */
export function membershipRows(user) {
  const officership = user?.officership
  if (!officership?.organizationName && !officership?.position) return []
  return [
    { label: 'Member of', value: officership.organizationName },
    { label: 'Position', value: officership.position },
  ].filter((row) => row.value)
}
