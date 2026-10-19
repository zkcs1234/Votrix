import { ApiError } from './ApiError.js'

export function validateGroupName(value, groups, exceptId = null) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) throw new ApiError(400, 'Election group name is required')
  if (name.length > 255) throw new ApiError(400, 'Election group name must be 255 characters or fewer')
  if (groups.some((group) => group.id !== exceptId && group.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new ApiError(409, 'An election group with this name already exists')
  }
  return name
}

export function eligibleGroups(groups, assignments, participantId) {
  const allowed = new Set(assignments.filter((row) => row.participant_id === participantId).map((row) => row.ballot_section_id))
  return groups.filter((group) => group.eligibility_mode === 'all' || group.eligibility_mode == null || allowed.has(group.id))
}
