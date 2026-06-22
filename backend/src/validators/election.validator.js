import { ApiError } from '../utils/ApiError.js'

export const ELECTION_RESULTS_VISIBILITY = ['real_time', 'hidden', 'public']

function normalizeResultsVisibility(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return 'public'
  if (!ELECTION_RESULTS_VISIBILITY.includes(value)) {
    throw new ApiError(
      400,
      `resultsVisibility must be one of ${ELECTION_RESULTS_VISIBILITY.join(', ')}`,
    )
  }
  return value
}

function assertValidDateRange(startDate, endDate) {
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    throw new ApiError(400, 'End date must be on or after start date')
  }
}

export function validateCreateEvent(body) {
  if (!body?.title?.trim()) throw new ApiError(400, 'Event title is required')
  const startDate = body.startDate || null
  const endDate = body.endDate || null
  assertValidDateRange(startDate, endDate)
  return {
    title: body.title.trim(),
    description: body.description?.trim() || null,
    banner: body.banner || null,
    startDate,
    endDate,
    status: body.status || 'draft',
    resultsVisibility: normalizeResultsVisibility(body.resultsVisibility) ?? 'public',
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
  if (body.resultsVisibility !== undefined) {
    payload.resultsVisibility = normalizeResultsVisibility(body.resultsVisibility)
  }

  return payload
}

export function validatePosition(body) {
  if (!body?.name?.trim()) throw new ApiError(400, 'Position name is required')
  const allowSkip = Boolean(body.allowSkip)
  const minVote = Number(body.minVote ?? 1)
  const maxVote = Number(body.maxVote ?? 1)
  if (Number.isNaN(minVote) || Number.isNaN(maxVote) || minVote < 0 || maxVote < minVote) {
    throw new ApiError(400, 'Invalid vote range')
  }
  if (!allowSkip && minVote < 1) {
    throw new ApiError(400, 'minVote must be at least 1 when skipping is not allowed')
  }

  const numberOfWinners = Number(body.numberOfWinners ?? 1)
  if (!Number.isInteger(numberOfWinners) || numberOfWinners < 1) {
    throw new ApiError(400, 'Number of winners must be a positive integer')
  }

  let displayOrder
  if (body.displayOrder !== undefined && body.displayOrder !== null && body.displayOrder !== '') {
    displayOrder = Number(body.displayOrder)
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      throw new ApiError(400, 'Display order must be a non-negative integer')
    }
  }

  return {
    name: body.name.trim(),
    description: body.description?.trim() || null,
    minVote,
    maxVote,
    numberOfWinners,
    displayOrder,
    allowSkip,
  }
}

export function validateCandidate(body) {
  if (!body?.name?.trim()) throw new ApiError(400, 'Candidate name is required')
  // `party` is the spec name; `partylist` is the legacy field name. Accept
  // either, persist to the existing column so voting logic doesn't change.
  const party = body.party ?? body.partylist
  return {
    name: body.name.trim(),
    photo: body.photo || null,
    description: body.description?.trim() || null,
    biography: body.biography?.trim() || null,
    platform: body.platform?.trim() || null,
    partylist: party?.trim?.() || null,
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
