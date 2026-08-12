import { db as getClient } from '../foundation/index.js'
import { ApiError } from '../utils/ApiError.js'
import {
  DB_TABLES,
  SCORE_TYPES,
  CALCULATION_METHODS,
  JUDGE_ROLES,
  ASSIGNMENT_SCOPES,
  PARTICIPANT_TYPES,
} from '../utils/constants.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { listDivisions } from './competition-division.service.js'

// ---------------------------------------------------------------------------
// Phase 4 — Competition Scoring Foundation service.
// Adds dynamic Categories, Rounds, and a first-class judge model on top of
// the existing contestant / criteria / scores tables.
// ---------------------------------------------------------------------------

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
    divisionId: row.division_id ?? null,
    name: row.name,
    description: row.description,
    displayOrder: row.display_order,
    weight: Number(row.weight),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCategories(eventId, organizerId, filters = {}) {
  await assertCompetitionEvent(eventId, organizerId)
  let query = getClient()
    .from(DB_TABLES.COMPETITION_CATEGORIES)
    .select('*')
    .eq('event_id', eventId)

  // Division filter (optional)
  if (filters.divisionId !== undefined) {
    query = query.eq('division_id', filters.divisionId)
  }

  query = query
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  const { data, error } = await query
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapCategory)
}

export async function createCategory(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  // Validate division belongs to event if provided
  if (payload.divisionId) {
    const { data: div, error: divErr } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('id', payload.divisionId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (divErr) throw new ApiError(500, divErr.message)
    if (!div) throw new ApiError(400, 'Division does not belong to this event')
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_CATEGORIES)
    .insert({
      event_id: eventId,
      division_id: payload.divisionId ?? null,
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

  // Validate division if being updated
  if (payload.divisionId !== undefined && payload.divisionId !== null) {
    const { data: div, error: divErr } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('id', payload.divisionId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (divErr) throw new ApiError(500, divErr.message)
    if (!div) throw new ApiError(400, 'Division does not belong to this event')
  }

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.displayOrder !== undefined) updates.display_order = payload.displayOrder
  if (payload.weight !== undefined) updates.weight = payload.weight
  if (payload.isActive !== undefined) updates.is_active = payload.isActive
  if (payload.divisionId !== undefined) updates.division_id = payload.divisionId

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
    divisionId: row.division_id ?? null,
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

export async function listRounds(eventId, organizerId, filters = {}) {
  await assertCompetitionEvent(eventId, organizerId)
  
  let query = getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('*')
    .eq('event_id', eventId)

  if (filters.divisionId !== undefined) {
    query = query.eq('division_id', filters.divisionId)
  }

  const { data, error } = await query
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

  if (payload.divisionId) {
    const { data: div, error: divErr } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('id', payload.divisionId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (divErr) throw new ApiError(500, divErr.message)
    if (!div) throw new ApiError(400, 'Division does not belong to this event')
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .insert({
      event_id: eventId,
      category_id: payload.categoryId ?? null,
      division_id: payload.divisionId ?? null,
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
  
  if (payload.divisionId !== undefined && payload.divisionId !== null) {
    const { data: div, error: divErr } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('id', payload.divisionId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (divErr) throw new ApiError(500, divErr.message)
    if (!div) throw new ApiError(400, 'Division does not belong to this event')
  }

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.categoryId !== undefined) updates.category_id = payload.categoryId
  if (payload.displayOrder !== undefined) updates.display_order = payload.displayOrder
  if (payload.weight !== undefined) updates.weight = payload.weight
  if (payload.isOpen !== undefined) updates.is_open = payload.isOpen
  if (payload.startsAt !== undefined) updates.starts_at = payload.startsAt
  if (payload.endsAt !== undefined) updates.ends_at = payload.endsAt
  if (payload.divisionId !== undefined) updates.division_id = payload.divisionId

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

  const [participantsRes, judgesRes] = await Promise.all([
    getClient()
      .from(DB_TABLES.EVENT_PARTICIPANTS)
      .select('id, event_id, user_id, first_name, last_name, has_scored, metadata, created_at, users!inner (id, email)')
      .eq('event_id', eventId)
      .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
      .order('created_at', { ascending: false }),
    getClient()
      .from(DB_TABLES.COMPETITION_JUDGES)
      .select('*, users (id, email)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
  ])

  if (participantsRes.error) throw new ApiError(500, participantsRes.error.message)
  if (judgesRes.error) throw new ApiError(500, judgesRes.error.message)

  const merged = new Map()

  // Index competition_judges rows by user_id for fast lookup
  const judgeRowByUserId = new Map()
  for (const row of judgesRes.data ?? []) {
    judgeRowByUserId.set(row.user_id, row)
  }

  // Auto-create missing competition_judges rows for participants that don't have one yet
  const missingUserIds = (participantsRes.data ?? [])
    .filter((p) => !judgeRowByUserId.has(p.user_id))
    .map((p) => p.user_id)

  if (missingUserIds.length > 0) {
    const inserts = missingUserIds.map((userId) => {
      const p = participantsRes.data.find((r) => r.user_id === userId)
      return {
        event_id: eventId,
        user_id: userId,
        role: 'judge',
        display_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.users?.email || null,
        is_active: true,
      }
    })
    const { data: newRows } = await getClient()
      .from(DB_TABLES.COMPETITION_JUDGES)
      .upsert(inserts, { onConflict: 'event_id,user_id', ignoreDuplicates: false })
      .select('*, users (id, email)')
    for (const row of newRows ?? []) {
      judgeRowByUserId.set(row.user_id, row)
    }
  }

  for (const row of participantsRes.data ?? []) {
    const judgeRow = judgeRowByUserId.get(row.user_id)
    merged.set(row.user_id, {
      // Always use competition_judges.id so assignment endpoints work
      id: judgeRow?.id ?? row.id,
      eventId: eventId,
      judgeId: row.user_id,
      email: judgeRow?.users?.email ?? row.users?.email ?? null,
      displayName: judgeRow?.display_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || row.users?.email || null,
      role: judgeRow?.role ?? 'judge',
      isActive: judgeRow?.is_active ?? true,
      hasSubmitted: Boolean(row.has_scored) || Boolean(judgeRow?.has_submitted),
      createdAt: row.created_at,
      updatedAt: judgeRow?.updated_at ?? row.updated_at ?? row.created_at,
    })
  }

  // Include any competition_judges rows not in event_participants (edge case)
  for (const row of judgesRes.data ?? []) {
    if (!merged.has(row.user_id)) {
      merged.set(row.user_id, {
        id: row.id,
        eventId: row.event_id,
        judgeId: row.user_id,
        email: row.users?.email ?? null,
        displayName: row.display_name ?? row.users?.email ?? null,
        role: row.role ?? 'judge',
        isActive: row.is_active ?? true,
        hasSubmitted: Boolean(row.has_submitted),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    }
  }

  return Array.from(merged.values()).map(mapJudge)
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

  const { data: judgeRow, error: judgeErr } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGES)
    .select('id, event_id')
    .eq('id', judgeId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (judgeErr) throw new ApiError(500, judgeErr.message)
  if (!judgeRow) throw new ApiError(404, 'Judge not found for this event')

  // Validate scope_id belongs to the right table + event.
  const scopeId = payload.scopeId
  if (payload.scope === ASSIGNMENT_SCOPES.EVENT) {
    if (scopeId !== eventId) {
      throw new ApiError(400, 'Event assignments must use the current event id')
    }
  } else {
    let table
    if (payload.scope === ASSIGNMENT_SCOPES.CATEGORY) table = DB_TABLES.COMPETITION_CATEGORIES
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

// ---------------------------------------------------------------------------
// DB operations extracted from competition.controller.js
// ---------------------------------------------------------------------------

export async function getScoringConfig(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('scoring_config')
    .eq('id', eventId)
    .single()
  if (error) throw new ApiError(500, error.message)
  return mergeScoringConfig(data.scoring_config)
}

export async function setScoringConfig(eventId, organizerId, partialConfig) {
  await assertCompetitionEvent(eventId, organizerId)
  const current = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('scoring_config')
    .eq('id', eventId)
    .single()
  if (current.error) throw new ApiError(500, current.error.message)
  const merged = mergeScoringConfig({
    ...(current.data?.scoring_config ?? {}),
    ...partialConfig,
  })
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ scoring_config: merged })
    .eq('id', eventId)
    .select('scoring_config')
    .single()
  if (error) throw new ApiError(500, error.message)
  return merged
}

export async function getCompetitionFoundation(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const [eventRes, cats, rounds, criteria, contestants, judges, assignments, roundLinks, divisions] =
    await Promise.all([
      getClient()
        .from(DB_TABLES.EVENTS)
        .select('id, title, scoring_config, scoring_enabled, event_type, divisions_enabled')
        .eq('id', eventId)
        .single(),
      listCategories(eventId, organizerId),
      listRounds(eventId, organizerId),
      getClient()
        .from(DB_TABLES.CRITERIA)
        .select('*')
        .eq('event_id', eventId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
      getClient()
        .from(DB_TABLES.CONTESTANTS)
        .select('*')
        .eq('event_id', eventId)
        .order('contestant_number', { ascending: true }),
      listCompetitionJudges(eventId, organizerId),
      getClient()
        .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
        .select('id, judge_id, scope, scope_id, competition_judges!inner(event_id)')
        .eq('competition_judges.event_id', eventId),
      Promise.all([
        getClient().from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS).select('round_id, contestant_id'),
        getClient().from(DB_TABLES.COMPETITION_ROUND_CRITERIA).select('round_id, criteria_id'),
      ]).then(([rc, cr]) => ({ contestants: rc.data ?? [], criteria: cr.data ?? [] })),
      listDivisions(eventId, true), // includeInactive = true to get all divisions
    ])

  if (eventRes.error) throw new ApiError(500, eventRes.error.message)
  if (criteria.error) throw new ApiError(500, criteria.error.message)
  if (contestants.error) throw new ApiError(500, contestants.error.message)
  if (assignments.error) throw new ApiError(500, assignments.error.message)

  return {
    event: eventRes.data,
    scoringConfig: mergeScoringConfig(eventRes.data.scoring_config),
    divisions,
    categories: cats,
    rounds: rounds.map((r) => ({
      ...r,
      contestantIds: roundLinks.contestants.filter((x) => x.round_id === r.id).map((x) => x.contestant_id),
      criteriaIds: roundLinks.criteria.filter((x) => x.round_id === r.id).map((x) => x.criteria_id),
    })),
    criteria: criteria.data ?? [],
    contestants: contestants.data ?? [],
    judges,
    assignments: (assignments.data ?? []).map((a) => ({
      id: a.id,
      judgeId: a.judge_id,
      scope: a.scope,
      scopeId: a.scope_id,
    })),
  }
}
