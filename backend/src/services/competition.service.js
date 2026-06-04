import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import {
  DB_TABLES,
  SCORE_TYPES,
  CALCULATION_METHODS,
  JUDGE_ROLES,
  ASSIGNMENT_SCOPES,
} from '../utils/constants.js'
import { assertOrganizerOwnsEvent } from './event.service.js'

// ---------------------------------------------------------------------------
// Phase 4 — Competition Scoring Foundation service.
// Adds dynamic Categories, Rounds, and a first-class judge model on top of
// the existing contestant / criteria / scores tables.
// ---------------------------------------------------------------------------

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

async function assertCompetitionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (!['pageant', 'competition_scoring'].includes(event.event_type)) {
    throw new ApiError(400, 'This event is not a competition scoring event')
  }
  return event
}

// ---------------------------------------------------------------------------
// Scoring engine (Phase 5) — used by rankings AND submission validation.
// Rules live in events.scoring_config; defaults match the legacy behavior.
// ---------------------------------------------------------------------------
const DEFAULT_SCORING_CONFIG = Object.freeze({
  scoreType: SCORE_TYPES.RANGE_1_100,
  calculationMethod: CALCULATION_METHODS.WEIGHTED_AVERAGE,
  decimalPlaces: 2,
  customMin: null,
  customMax: null,
  dropHighest: 0,
  dropLowest: 0,
})

export function mergeScoringConfig(raw) {
  return { ...DEFAULT_SCORING_CONFIG, ...(raw || {}) }
}

export function resolveScoreBounds(config) {
  const cfg = mergeScoringConfig(config)
  switch (cfg.scoreType) {
    case SCORE_TYPES.RANGE_1_10:
      return { min: 1, max: 10 }
    case SCORE_TYPES.RANGE_1_100:
      return { min: 1, max: 100 }
    case SCORE_TYPES.DECIMAL:
      return { min: 0, max: 10 }
    case SCORE_TYPES.CUSTOM_RANGE: {
      const min = Number(cfg.customMin ?? 0)
      const max = Number(cfg.customMax ?? 100)
      if (Number.isNaN(min) || Number.isNaN(max) || max < min) {
        return { min: 0, max: 100 }
      }
      return { min, max }
    }
    default:
      return { min: 1, max: 100 }
  }
}

export function isValidCalculationMethod(method) {
  return Object.values(CALCULATION_METHODS).includes(method)
}

export function isValidScoreType(type) {
  return Object.values(SCORE_TYPES).includes(type)
}

export function isValidJudgeRole(role) {
  return Object.values(JUDGE_ROLES).includes(role)
}

export function isValidAssignmentScope(scope) {
  return Object.values(ASSIGNMENT_SCOPES).includes(scope)
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
function mapCategory(row) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description,
    displayOrder: row.display_order,
    weight: Number(row.weight),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCategories(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_CATEGORIES)
    .select('*')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapCategory)
}

export async function createCategory(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_CATEGORIES)
    .insert({
      event_id: eventId,
      name: payload.name,
      description: payload.description ?? null,
      display_order: payload.displayOrder ?? 0,
      weight: payload.weight ?? 0,
      is_active: payload.isActive ?? true,
    })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return mapCategory(data)
}

export async function updateCategory(eventId, organizerId, categoryId, payload) {
  await assertCompetitionEvent(eventId, organizerId)
  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.displayOrder !== undefined) updates.display_order = payload.displayOrder
  if (payload.weight !== undefined) updates.weight = payload.weight
  if (payload.isActive !== undefined) updates.is_active = payload.isActive

  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_CATEGORIES)
    .update(updates)
    .eq('id', categoryId)
    .eq('event_id', eventId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Category not found')
  return mapCategory(data)
}

export async function deleteCategory(eventId, organizerId, categoryId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_CATEGORIES)
    .delete()
    .eq('id', categoryId)
    .eq('event_id', eventId)
  if (error) throw new ApiError(500, error.message)
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------
function mapRound(row) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    displayOrder: row.display_order,
    weight: Number(row.weight),
    isOpen: row.is_open,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listRounds(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('*')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapRound)
}

export async function createRound(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  if (payload.categoryId) {
    const { data: cat, error: catErr } = await getClient()
      .from(DB_TABLES.COMPETITION_CATEGORIES)
      .select('id')
      .eq('id', payload.categoryId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (catErr) throw new ApiError(500, catErr.message)
    if (!cat) throw new ApiError(400, 'Category does not belong to this event')
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .insert({
      event_id: eventId,
      category_id: payload.categoryId ?? null,
      name: payload.name,
      description: payload.description ?? null,
      display_order: payload.displayOrder ?? 0,
      weight: payload.weight ?? 0,
      is_open: payload.isOpen ?? false,
      starts_at: payload.startsAt ?? null,
      ends_at: payload.endsAt ?? null,
    })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return mapRound(data)
}

export async function updateRound(eventId, organizerId, roundId, payload) {
  await assertCompetitionEvent(eventId, organizerId)
  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.categoryId !== undefined) updates.category_id = payload.categoryId
  if (payload.displayOrder !== undefined) updates.display_order = payload.displayOrder
  if (payload.weight !== undefined) updates.weight = payload.weight
  if (payload.isOpen !== undefined) updates.is_open = payload.isOpen
  if (payload.startsAt !== undefined) updates.starts_at = payload.startsAt
  if (payload.endsAt !== undefined) updates.ends_at = payload.endsAt

  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .update(updates)
    .eq('id', roundId)
    .eq('event_id', eventId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Round not found')
  return mapRound(data)
}

export async function deleteRound(eventId, organizerId, roundId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .delete()
    .eq('id', roundId)
    .eq('event_id', eventId)
  if (error) throw new ApiError(500, error.message)
}

// ---------------------------------------------------------------------------
// Round ↔ Contestants / Criteria
// ---------------------------------------------------------------------------
export async function addContestantToRound(eventId, organizerId, roundId, contestantId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS)
    .insert({ round_id: roundId, contestant_id: contestantId })
  if (error && error.code !== '23505') throw new ApiError(500, error.message)
  return { success: true }
}

export async function removeContestantFromRound(eventId, organizerId, roundId, contestantId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS)
    .delete()
    .eq('round_id', roundId)
    .eq('contestant_id', contestantId)
  if (error) throw new ApiError(500, error.message)
  return { success: true }
}

export async function addCriteriaToRound(eventId, organizerId, roundId, criteriaId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
    .insert({ round_id: roundId, criteria_id: criteriaId })
  if (error && error.code !== '23505') throw new ApiError(500, error.message)
  return { success: true }
}

export async function removeCriteriaFromRound(eventId, organizerId, roundId, criteriaId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
    .delete()
    .eq('round_id', roundId)
    .eq('criteria_id', criteriaId)
  if (error) throw new ApiError(500, error.message)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Validation helpers used by the scoring toggle and by setScoringConfig.
// ---------------------------------------------------------------------------
export async function assertScoringWeightsValid(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const [{ data: cats, error: catErr }, { data: rounds, error: rErr }, { data: crits, error: cErr }] =
    await Promise.all([
      getClient().from(DB_TABLES.COMPETITION_CATEGORIES).select('weight').eq('event_id', eventId),
      getClient().from(DB_TABLES.COMPETITION_ROUNDS).select('weight').eq('event_id', eventId),
      getClient().from(DB_TABLES.CRITERIA).select('percentage').eq('event_id', eventId),
    ])

  if (catErr) throw new ApiError(500, catErr.message)
  if (rErr) throw new ApiError(500, rErr.message)
  if (cErr) throw new ApiError(500, cErr.message)

  if ((cats ?? []).length) {
    const total = (cats ?? []).reduce((s, c) => s + Number(c.weight), 0)
    if (Math.abs(total - 100) > 0.01) {
      throw new ApiError(400, `Category weights must total 100% (currently ${total}%)`)
    }
  }
  if ((rounds ?? []).length) {
    const total = (rounds ?? []).reduce((s, r) => s + Number(r.weight), 0)
    if (Math.abs(total - 100) > 0.01) {
      throw new ApiError(400, `Round weights must total 100% (currently ${total}%)`)
    }
  }
  if ((crits ?? []).length) {
    const total = (crits ?? []).reduce((s, c) => s + Number(c.percentage), 0)
    if (Math.abs(total - 100) > 0.01) {
      throw new ApiError(400, `Criteria weights must total 100% (currently ${total}%)`)
    }
  }
}

// ---------------------------------------------------------------------------
// First-class judges + assignments (Phase 6 API surface lives here too).
// ---------------------------------------------------------------------------
function mapJudge(row) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id,
    judgeId: row.user_id,
    email: row.users?.email ?? row.email ?? null,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
    hasSubmitted: row.has_submitted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCompetitionJudges(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGES)
    .select('*, users (id, email)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapJudge)
}

export async function inviteCompetitionJudge(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)
  const { inviteJudge } = await import('./pageant.service.js')
  const { user } = await inviteJudge(eventId, organizerId, {
    email: payload.email,
    temporaryPassword: payload.temporaryPassword,
    firstName: payload.firstName,
    lastName: payload.lastName,
  })

  // Promote to first-class judge row.
  const role = isValidJudgeRole(payload.role) ? payload.role : JUDGE_ROLES.JUDGE
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGES)
    .upsert(
      {
        event_id: eventId,
        user_id: user.id,
        role,
        display_name: [payload.firstName, payload.lastName].filter(Boolean).join(' ') || user.email,
        is_active: true,
      },
      { onConflict: 'event_id,user_id' },
    )
    .select('*, users (id, email)')
    .single()
  if (error) throw new ApiError(500, error.message)
  return mapJudge(data)
}

export async function updateCompetitionJudge(eventId, organizerId, judgeId, payload) {
  await assertCompetitionEvent(eventId, organizerId)
  const updates = {}
  if (payload.role !== undefined) {
    if (!isValidJudgeRole(payload.role)) {
      throw new ApiError(400, `Invalid role. Must be one of: ${Object.values(JUDGE_ROLES).join(', ')}`)
    }
    updates.role = payload.role
  }
  if (payload.displayName !== undefined) updates.display_name = payload.displayName
  if (payload.isActive !== undefined) updates.is_active = payload.isActive

  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGES)
    .update(updates)
    .eq('id', judgeId)
    .eq('event_id', eventId)
    .select('*, users (id, email)')
    .single()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Judge not found')
  return mapJudge(data)
}

export async function deleteCompetitionJudge(eventId, organizerId, judgeId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGES)
    .delete()
    .eq('id', judgeId)
    .eq('event_id', eventId)
  if (error) throw new ApiError(500, error.message)
}

// ---------------------------------------------------------------------------
// Judge assignments
// ---------------------------------------------------------------------------
function mapAssignment(row) {
  return {
    id: row.id,
    judgeId: row.judge_id,
    scope: row.scope,
    scopeId: row.scope_id,
    createdAt: row.created_at,
  }
}

export async function listJudgeAssignments(eventId, organizerId, judgeId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
    .select('*, competition_judges!inner(event_id)')
    .eq('judge_id', judgeId)
    .eq('competition_judges.event_id', eventId)
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapAssignment)
}

export async function createJudgeAssignment(eventId, organizerId, judgeId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  if (!isValidAssignmentScope(payload.scope)) {
    throw new ApiError(400, `Invalid scope. Must be one of: ${Object.values(ASSIGNMENT_SCOPES).join(', ')}`)
  }

  // Validate scope_id belongs to the right table + event.
  const scopeId = payload.scopeId
  let table
  if (payload.scope === ASSIGNMENT_SCOPES.EVENT) table = DB_TABLES.EVENTS
  else if (payload.scope === ASSIGNMENT_SCOPES.CATEGORY) table = DB_TABLES.COMPETITION_CATEGORIES
  else table = DB_TABLES.COMPETITION_ROUNDS

  const { data: scopeRow, error: scopeErr } = await getClient()
    .from(table)
    .select('id, event_id')
    .eq('id', scopeId)
    .maybeSingle()
  if (scopeErr) throw new ApiError(500, scopeErr.message)
  if (!scopeRow) throw new ApiError(400, 'scopeId does not exist')
  if (scopeRow.event_id !== eventId) {
    throw new ApiError(400, 'scopeId does not belong to this event')
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
    .insert({ judge_id: judgeId, scope: payload.scope, scope_id: scopeId })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'This assignment already exists')
    throw new ApiError(500, error.message)
  }
  return mapAssignment(data)
}

export async function deleteJudgeAssignment(eventId, organizerId, judgeId, assignmentId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
    .delete()
    .eq('id', assignmentId)
    .eq('judge_id', judgeId)
  if (error) throw new ApiError(500, error.message)
  return { success: true }
}
