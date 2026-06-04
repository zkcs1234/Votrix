import { ApiError } from '../utils/ApiError.js'

export function validateCompetitionEvent(body, isCreate = false) {
  if (isCreate && !body?.title?.trim()) {
    throw new ApiError(400, 'Event title is required')
  }

  const payload = {}
  if (body.title !== undefined) payload.title = body.title.trim()
  if (body.description !== undefined) payload.description = body.description?.trim() || null
  if (body.banner !== undefined) payload.banner = body.banner
  if (body.startDate !== undefined) payload.startDate = body.startDate
  if (body.endDate !== undefined) payload.endDate = body.endDate
  if (body.status !== undefined) payload.status = body.status

  return payload
}

export function validateContestant(body) {
  if (!body?.name?.trim()) throw new ApiError(400, 'Contestant name is required')
  const num = Number(body.contestantNumber)
  if (!Number.isInteger(num) || num < 1) {
    throw new ApiError(400, 'Contestant number must be a positive integer')
  }
  return {
    name: body.name.trim(),
    photo: body.photo || null,
    contestantNumber: num,
  }
}

export function validateCriteria(body) {
  if (!body?.name?.trim()) throw new ApiError(400, 'Criteria name is required')
  const percentage = Number(body.percentage)
  const minScore = Number(body.minScore ?? 0)
  const maxScore = Number(body.maxScore ?? 100)

  if (percentage < 0 || percentage > 100) {
    throw new ApiError(400, 'Percentage must be between 0 and 100')
  }
  if (maxScore < minScore) {
    throw new ApiError(400, 'maxScore must be >= minScore')
  }

  return { name: body.name.trim(), percentage, minScore, maxScore }
}

export function validateScoringToggle(body) {
  if (typeof body?.scoringEnabled !== 'boolean') {
    throw new ApiError(400, 'scoringEnabled must be a boolean')
  }
  return body.scoringEnabled
}

export function validateJudgeScores(body) {
  const scores = body?.scores
  if (!Array.isArray(scores) || !scores.length) {
    throw new ApiError(400, 'scores array is required')
  }

  return scores.map((s) => ({
    contestantId: s.contestantId,
    criteriaId: s.criteriaId,
    score: s.score,
  }))
}

// Backward-compatible aliases. Existing imports from the pageant validator
// keep working until all call sites are migrated.
export const validatePageantEvent = validateCompetitionEvent
