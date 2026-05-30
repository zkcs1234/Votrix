import { ApiError } from '../utils/ApiError.js'

export function validateCreateEvent(body) {
  if (!body?.title?.trim()) throw new ApiError(400, 'Event title is required')
  return {
    title: body.title.trim(),
    description: body.description?.trim() || null,
    banner: body.banner || null,
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    status: body.status || 'draft',
  }
}

export function validateUpdateEvent(body) {
  const payload = {}
  if (body.title !== undefined) payload.title = body.title.trim()
  if (body.description !== undefined) payload.description = body.description?.trim() || null
  if (body.banner !== undefined) payload.banner = body.banner
  if (body.startDate !== undefined) payload.startDate = body.startDate
  if (body.endDate !== undefined) payload.endDate = body.endDate
  if (body.status !== undefined) payload.status = body.status
  return payload
}

export function validatePosition(body) {
  if (!body?.name?.trim()) throw new ApiError(400, 'Position name is required')
  const minVote = Number(body.minVote ?? 1)
  const maxVote = Number(body.maxVote ?? 1)
  if (minVote < 0 || maxVote < minVote) {
    throw new ApiError(400, 'Invalid vote range')
  }
  return {
    name: body.name.trim(),
    minVote,
    maxVote,
    allowSkip: Boolean(body.allowSkip),
  }
}

export function validateCandidate(body) {
  if (!body?.name?.trim()) throw new ApiError(400, 'Candidate name is required')
  return {
    name: body.name.trim(),
    photo: body.photo || null,
    description: body.description?.trim() || null,
    partylist: body.partylist?.trim() || null,
  }
}

export function validateBallot(body) {
  const selections = body?.selections
  if (!selections || typeof selections !== 'object') {
    throw new ApiError(400, 'Ballot selections are required')
  }
  const normalized = {}
  for (const [positionId, candidateIds] of Object.entries(selections)) {
    if (!Array.isArray(candidateIds)) {
      throw new ApiError(400, 'Each position must have an array of candidate IDs')
    }
    normalized[positionId] = candidateIds
  }
  return normalized
}

export function validateVotingToggle(body) {
  if (typeof body?.votingEnabled !== 'boolean') {
    throw new ApiError(400, 'votingEnabled must be a boolean')
  }
  return body.votingEnabled
}
