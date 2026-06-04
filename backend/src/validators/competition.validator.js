import { ApiError } from '../utils/ApiError.js'
import {
  SCORE_TYPES,
  CALCULATION_METHODS,
  JUDGE_ROLES,
  ASSIGNMENT_SCOPES,
} from '../utils/constants.js'

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
    roundId: s.roundId ?? null,
    categoryId: s.categoryId ?? null,
    score: s.score,
  }))
}

// Backward-compatible aliases. Existing imports from the pageant validator
// keep working until all call sites are migrated.
export const validatePageantEvent = validateCompetitionEvent

// ---------------------------------------------------------------------------
// Phase 4 — Categories
// ---------------------------------------------------------------------------
export function validateCategory(body) {
  if (!body?.name?.trim()) throw new ApiError(400, 'Category name is required')
  const weight = Number(body.weight ?? 0)
  if (Number.isNaN(weight) || weight < 0 || weight > 100) {
    throw new ApiError(400, 'Category weight must be between 0 and 100')
  }
  const displayOrder = body.displayOrder !== undefined ? Number(body.displayOrder) : 0
  return {
    name: body.name.trim(),
    description: body.description?.trim() || null,
    displayOrder: Number.isInteger(displayOrder) ? displayOrder : 0,
    weight,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
  }
}

// ---------------------------------------------------------------------------
// Phase 4 — Rounds
// ---------------------------------------------------------------------------
export function validateRound(body) {
  if (!body?.name?.trim()) throw new ApiError(400, 'Round name is required')
  const weight = Number(body.weight ?? 0)
  if (Number.isNaN(weight) || weight < 0 || weight > 100) {
    throw new ApiError(400, 'Round weight must be between 0 and 100')
  }
  const displayOrder = body.displayOrder !== undefined ? Number(body.displayOrder) : 0
  return {
    name: body.name.trim(),
    description: body.description?.trim() || null,
    categoryId: body.categoryId || null,
    displayOrder: Number.isInteger(displayOrder) ? displayOrder : 0,
    weight,
    isOpen: body.isOpen !== undefined ? Boolean(body.isOpen) : false,
    startsAt: body.startsAt || null,
    endsAt: body.endsAt || null,
  }
}

// ---------------------------------------------------------------------------
// Phase 5 — Scoring configuration
// ---------------------------------------------------------------------------
export function validateScoringConfig(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'scoring config is required')
  }

  const config = {}

  if (body.scoreType !== undefined) {
    if (!Object.values(SCORE_TYPES).includes(body.scoreType)) {
      throw new ApiError(
        400,
        `scoreType must be one of: ${Object.values(SCORE_TYPES).join(', ')}`,
      )
    }
    config.scoreType = body.scoreType
  }

  if (body.calculationMethod !== undefined) {
    if (!Object.values(CALCULATION_METHODS).includes(body.calculationMethod)) {
      throw new ApiError(
        400,
        `calculationMethod must be one of: ${Object.values(CALCULATION_METHODS).join(', ')}`,
      )
    }
    config.calculationMethod = body.calculationMethod
  }

  if (body.decimalPlaces !== undefined) {
    const dp = Number(body.decimalPlaces)
    if (!Number.isInteger(dp) || dp < 0 || dp > 6) {
      throw new ApiError(400, 'decimalPlaces must be an integer between 0 and 6')
    }
    config.decimalPlaces = dp
  }

  if (body.scoreType === SCORE_TYPES.CUSTOM_RANGE) {
    const min = Number(body.customMin)
    const max = Number(body.customMax)
    if (Number.isNaN(min) || Number.isNaN(max)) {
      throw new ApiError(400, 'customMin and customMax are required for custom_range')
    }
    if (max < min) throw new ApiError(400, 'customMax must be >= customMin')
    config.customMin = min
    config.customMax = max
  }

  if (body.dropHighest !== undefined) {
    const n = Number(body.dropHighest)
    if (!Number.isInteger(n) || n < 0) {
      throw new ApiError(400, 'dropHighest must be a non-negative integer')
    }
    config.dropHighest = n
  }
  if (body.dropLowest !== undefined) {
    const n = Number(body.dropLowest)
    if (!Number.isInteger(n) || n < 0) {
      throw new ApiError(400, 'dropLowest must be a non-negative integer')
    }
    config.dropLowest = n
  }

  return config
}

// ---------------------------------------------------------------------------
// Phase 6 — Judge permission roles and assignments
// ---------------------------------------------------------------------------
export function validateJudgeRole(body) {
  const role = body?.role
  if (role !== undefined && !Object.values(JUDGE_ROLES).includes(role)) {
    throw new ApiError(400, `Invalid role. Must be one of: ${Object.values(JUDGE_ROLES).join(', ')}`)
  }
  return {
    role: role ?? JUDGE_ROLES.JUDGE,
    displayName: body?.displayName?.trim() || null,
    isActive: body?.isActive !== undefined ? Boolean(body.isActive) : true,
  }
}

export function validateAssignment(body) {
  if (!Object.values(ASSIGNMENT_SCOPES).includes(body?.scope)) {
    throw new ApiError(400, `scope must be one of: ${Object.values(ASSIGNMENT_SCOPES).join(', ')}`)
  }
  if (!body?.scopeId) {
    throw new ApiError(400, 'scopeId is required')
  }
  return { scope: body.scope, scopeId: body.scopeId }
}
