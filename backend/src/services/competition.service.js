import { db as getClient } from '../foundation/index.js'
import { recordEventActivity } from '../foundation/activity.js'
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
// Adds dynamic Categories, Rounds, and judge participants on top of
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
  recordEventActivity({
    eventId,
    action: 'competition.category.create',
    userId: organizerId,
    module: 'competition',
    details: { categoryId: data.id, name: data.name },
  })
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
  recordEventActivity({
    eventId,
    action: 'competition.category.update',
    userId: organizerId,
    module: 'competition',
    details: { categoryId: data.id, name: data.name },
  })
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
  recordEventActivity({
    eventId,
    action: 'competition.category.delete',
    userId: organizerId,
    module: 'competition',
    details: { categoryId },
  })
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
    // Phase 6: advancement/elimination config + finalize state.
    advancementType: row.advancement_type ?? 'none',
    advancementValue: row.advancement_value ?? null,
    scorePolicy: row.score_policy ?? 'independent',
    finalizedAt: row.finalized_at ?? null,
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
  recordEventActivity({
    eventId,
    action: 'competition.round.create',
    userId: organizerId,
    module: 'competition',
    details: { roundId: data.id, name: data.name },
  })
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
  // Phase 6: per-round advancement/elimination config.
  if (payload.advancementType !== undefined) updates.advancement_type = payload.advancementType
  if (payload.advancementValue !== undefined) updates.advancement_value = payload.advancementValue
  if (payload.scorePolicy !== undefined) updates.score_policy = payload.scorePolicy

  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .update(updates)
    .eq('id', roundId)
    .eq('event_id', eventId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Round not found')
  recordEventActivity({
    eventId,
    action: 'competition.round.update',
    userId: organizerId,
    module: 'competition',
    details: { roundId: data.id, name: data.name },
  })
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
  recordEventActivity({
    eventId,
    action: 'competition.round.delete',
    userId: organizerId,
    module: 'competition',
    details: { roundId },
  })
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
  recordEventActivity({
    eventId,
    action: 'competition.round.contestant.add',
    userId: organizerId,
    module: 'competition',
    details: { roundId, contestantId },
  })
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
  recordEventActivity({
    eventId,
    action: 'competition.round.contestant.remove',
    userId: organizerId,
    module: 'competition',
    details: { roundId, contestantId },
  })
  return { success: true }
}

export async function addCriteriaToRound(eventId, organizerId, roundId, criteriaId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
    .insert({ round_id: roundId, criteria_id: criteriaId })
  if (error && error.code !== '23505') throw new ApiError(500, error.message)
  recordEventActivity({
    eventId,
    action: 'competition.round.criteria.add',
    userId: organizerId,
    module: 'competition',
    details: { roundId, criteriaId },
  })
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
  recordEventActivity({
    eventId,
    action: 'competition.round.criteria.remove',
    userId: organizerId,
    module: 'competition',
    details: { roundId, criteriaId },
  })
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
      getClient().from(DB_TABLES.COMPETITION_ROUNDS).select('id, name, weight').eq('event_id', eventId),
      getClient().from(DB_TABLES.CRITERIA).select('id, name, percentage').eq('event_id', eventId),
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

  // Criteria weights (§8A). Feature-guarded on round↔criteria membership:
  //   - If the event uses per-round criteria, each round's assigned criteria
  //     must total 100% WITHIN that round (the flat event-wide sum would be
  //     N×100% and is meaningless).
  //   - Otherwise fall back to the legacy flat event-wide 100% rule, so simple
  //     and existing flat-model competitions are unaffected.
  const roundIds = (rounds ?? []).map((r) => r.id)
  let membership = []
  if (roundIds.length) {
    const { data: rcRows, error: rcErr } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
      .select('round_id, criteria_id')
      .in('round_id', roundIds)
    if (rcErr) throw new ApiError(500, rcErr.message)
    membership = rcRows ?? []
  }

  if (membership.length) {
    // Scope-aware: validate each round that has assigned criteria.
    const pctById = new Map((crits ?? []).map((c) => [c.id, Number(c.percentage)]))
    const nameById = new Map((rounds ?? []).map((r) => [r.id, r.name]))
    const byRound = new Map()
    for (const m of membership) {
      if (!byRound.has(m.round_id)) byRound.set(m.round_id, [])
      byRound.get(m.round_id).push(m.criteria_id)
    }
    for (const [roundId, critIds] of byRound) {
      const total = critIds.reduce((s, id) => s + (pctById.get(id) ?? 0), 0)
      if (Math.abs(total - 100) > 0.01) {
        const label = nameById.get(roundId) ?? 'round'
        throw new ApiError(
          400,
          `Criteria weights for "${label}" must total 100% (currently ${total}%)`,
        )
      }
    }
  } else if ((crits ?? []).length) {
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
    role: row.judge_role ?? row.role ?? JUDGE_ROLES.JUDGE,
    isActive: row.is_active,
    hasSubmitted: row.has_scored ?? row.has_submitted ?? false,
    invitationSent: row.invitation_sent ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCompetitionJudges(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('id, event_id, user_id, first_name, last_name, has_scored, judge_role, display_name, is_active, created_at, updated_at, users!inner (id, email)')
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)

  const judgeUserIds = (data ?? []).map((row) => row.user_id).filter(Boolean)
  let invitationMap = {}

  if (judgeUserIds.length) {
    const { data: invitations, error: invError } = await getClient()
      .from(DB_TABLES.INVITATIONS)
      .select('voter_id, invitation_sent')
      .eq('event_id', eventId)
      .in('voter_id', judgeUserIds)

    if (invError) throw new ApiError(500, invError.message)

    for (const inv of invitations ?? []) {
      invitationMap[inv.voter_id] = inv.invitation_sent
    }
  }

  return (data ?? []).map((row) => mapJudge({
    ...row,
    display_name: row.display_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || row.users?.email || null,
    invitation_sent: invitationMap[row.user_id] ?? false,
  }))
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

  const role = isValidJudgeRole(payload.role) ? payload.role : JUDGE_ROLES.JUDGE
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .update({
      judge_role: role,
      display_name: [payload.firstName, payload.lastName].filter(Boolean).join(' ') || user.email,
      is_active: true,
    })
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .select('id, event_id, user_id, has_scored, judge_role, display_name, is_active, created_at, updated_at, users (id, email)')
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
    updates.judge_role = payload.role
  }
  if (payload.displayName !== undefined) updates.display_name = payload.displayName
  if (payload.isActive !== undefined) updates.is_active = payload.isActive

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .update(updates)
    .eq('id', judgeId)
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .select('id, event_id, user_id, has_scored, judge_role, display_name, is_active, created_at, updated_at, users (id, email)')
    .single()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Judge not found')
  recordEventActivity({
    eventId,
    action: 'competition.judge.update',
    userId: organizerId,
    module: 'competition',
    details: { judgeId, role: data.judge_role ?? null, isActive: data.is_active },
  })
  return mapJudge(data)
}

export async function deleteCompetitionJudge(eventId, organizerId, judgeId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .delete()
    .eq('id', judgeId)
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
  if (error) throw new ApiError(500, error.message)
  recordEventActivity({
    eventId,
    action: 'competition.judge.delete',
    userId: organizerId,
    module: 'competition',
    details: { judgeId },
  })
}

// ---------------------------------------------------------------------------
// Judge assignments
// ---------------------------------------------------------------------------
function mapAssignment(row) {
  return {
    id: row.id,
    judgeId: row.participant_id,
    scope: row.scope,
    scopeId: row.scope_id,
    createdAt: row.created_at,
  }
}

async function assertJudgeParticipant(eventId, judgeId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('id, event_id')
    .eq('id', judgeId)
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Judge not found for this event')
  return data
}

export async function listJudgeAssignments(eventId, organizerId, judgeId) {
  await assertCompetitionEvent(eventId, organizerId)
  await assertJudgeParticipant(eventId, judgeId)

  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
    .select('*')
    .eq('participant_id', judgeId)
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapAssignment)
}

export async function createJudgeAssignment(eventId, organizerId, judgeId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  if (!isValidAssignmentScope(payload.scope)) {
    throw new ApiError(400, `Invalid scope. Must be one of: ${Object.values(ASSIGNMENT_SCOPES).join(', ')}`)
  }

  await assertJudgeParticipant(eventId, judgeId)

  // Validate scope_id belongs to the right table + event.
  const scopeId = payload.scopeId
  if (payload.scope === ASSIGNMENT_SCOPES.EVENT) {
    if (scopeId !== eventId) {
      throw new ApiError(400, 'Event assignments must use the current event id')
    }
  } else {
    let table
    if (payload.scope === ASSIGNMENT_SCOPES.CATEGORY) table = DB_TABLES.COMPETITION_CATEGORIES
    else if (payload.scope === ASSIGNMENT_SCOPES.ROUND) table = DB_TABLES.COMPETITION_ROUNDS
    else table = DB_TABLES.COMPETITION_DIVISIONS

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
    .insert({ participant_id: judgeId, scope: payload.scope, scope_id: scopeId })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'This assignment already exists')
    throw new ApiError(500, error.message)
  }
  recordEventActivity({
    eventId,
    action: 'competition.judge.assignment.create',
    userId: organizerId,
    module: 'competition',
    details: { judgeId, assignmentId: data.id, scope: data.scope, scopeId: data.scope_id },
  })
  return mapAssignment(data)
}

export async function deleteJudgeAssignment(eventId, organizerId, judgeId, assignmentId) {
  await assertCompetitionEvent(eventId, organizerId)
  await assertJudgeParticipant(eventId, judgeId)

  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
    .delete()
    .eq('id', assignmentId)
    .eq('participant_id', judgeId)
  if (error) throw new ApiError(500, error.message)
  recordEventActivity({
    eventId,
    action: 'competition.judge.assignment.delete',
    userId: organizerId,
    module: 'competition',
    details: { judgeId, assignmentId },
  })
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
  recordEventActivity({
    eventId,
    action: 'competition.scoring_config.update',
    userId: organizerId,
    module: 'competition',
    details: { changedKeys: Object.keys(partialConfig ?? {}) },
  })
  return merged
}

export async function getCompetitionFoundation(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const [eventRes, cats, rounds, criteria, contestants, judges, roundLinks, divisions] =
    await Promise.all([
      getClient()
        .from(DB_TABLES.EVENTS)
        .select('id, title, scoring_config, scoring_enabled, event_type, divisions_enabled, competition_type, awards_enabled')
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
      Promise.all([
        getClient().from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS).select('round_id, contestant_id'),
        getClient().from(DB_TABLES.COMPETITION_ROUND_CRITERIA).select('round_id, criteria_id'),
      ]).then(([rc, cr]) => ({ contestants: rc.data ?? [], criteria: cr.data ?? [] })),
      listDivisions(eventId, true), // includeInactive = true to get all divisions
    ])

  if (eventRes.error) throw new ApiError(500, eventRes.error.message)
  if (criteria.error) throw new ApiError(500, criteria.error.message)
  if (contestants.error) throw new ApiError(500, contestants.error.message)

  const judgeParticipantIds = judges.map((j) => j.id).filter(Boolean)
  let assignmentRows = []

  if (judgeParticipantIds.length) {
    const { data: assignments, error: assignmentError } = await getClient()
      .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
      .select('id, participant_id, scope, scope_id')
      .in('participant_id', judgeParticipantIds)

    if (assignmentError) throw new ApiError(500, assignmentError.message)
    assignmentRows = assignments ?? []
  }

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
    // 7.5: normalize contestants/criteria to a consistent camelCase shape
    // (snake_case kept via spread so existing readers don't break). Rounds,
    // categories, and divisions are already mapped to camelCase upstream.
    criteria: (criteria.data ?? []).map((c) => ({
      ...c,
      criteriaId: c.id,
      percentage: Number(c.percentage),
      minScore: c.min_score,
      maxScore: c.max_score,
      divisionId: c.division_id ?? null,
    })),
    contestants: (contestants.data ?? []).map((c) => ({
      ...c,
      contestantNumber: c.contestant_number,
      divisionId: c.division_id ?? null,
    })),
    judges,
    assignments: assignmentRows.map((a) => ({
      id: a.id,
      judgeId: a.participant_id,
      scope: a.scope,
      scopeId: a.scope_id,
    })),
  }
}
