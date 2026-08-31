// Competition Awards service (optional feature).
//
// Phase 1: award definitions + DERIVED awards (method 'score' | 'criteria') that
// reuse the existing scoring output — no new judge interaction, no scoring change.
// Interactive methods ('vote' | 'selection') are stored but computed in a later
// phase. Awards are off unless events.awards_enabled is true.

import { db as getClient } from '../foundation/index.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, COMPETITION_SCORING_EVENT_TYPES, PARTICIPANT_TYPES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { emitToEvent, emitToEventOrganizer } from '../websocket/ws-emitter.js'
import { recordEventActivity } from '../foundation/activity.js'

const AWARD_METHODS = new Set(['score', 'criteria', 'vote', 'selection'])

async function assertCompetitionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (!COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
    throw new ApiError(400, 'This event is not a competition scoring event')
  }
  return event
}

function mapAward(row) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description ?? null,
    method: row.method,
    divisionId: row.division_id ?? null,
    categoryId: row.category_id ?? null,
    sourceRoundId: row.source_round_id ?? null,
    sourceCriteriaId: row.source_criteria_id ?? null,
    status: row.status,
    tieBreak: row.tie_break ?? null,
    displayOrder: row.display_order ?? 0,
    finalizedAt: row.finalized_at ?? null,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Opt-in toggle (mirrors setDivisionsEnabled)
// ---------------------------------------------------------------------------
export async function setAwardsEnabled(eventId, organizerId, enabled) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ awards_enabled: Boolean(enabled) })
    .eq('id', eventId)
    .select('id, awards_enabled')
    .single()
  if (error) throw new ApiError(500, error.message)
  recordEventActivity({
    eventId,
    action: data.awards_enabled ? 'competition.awards.enable' : 'competition.awards.disable',
    userId: organizerId,
    module: 'competition',
  })
  return { eventId: data.id, awardsEnabled: data.awards_enabled }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function listAwards(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_AWARDS)
    .select('*')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapAward)
}

function validatePayload(payload) {
  const name = (payload.name ?? '').trim()
  if (!name) throw new ApiError(400, 'Award name is required')
  const method = payload.method ?? 'score'
  if (!AWARD_METHODS.has(method)) throw new ApiError(400, 'Invalid award method')
  if (method === 'score' && !payload.sourceRoundId) {
    throw new ApiError(400, 'A Score award needs a source round')
  }
  if (method === 'criteria' && !payload.sourceCriteriaId) {
    throw new ApiError(400, 'A Criteria award needs a source criterion')
  }
  return { name, method }
}

export async function createAward(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)
  const { name, method } = validatePayload(payload)
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_AWARDS)
    .insert({
      event_id: eventId,
      name,
      description: payload.description?.trim() || null,
      method,
      division_id: payload.divisionId || null,
      category_id: payload.categoryId || null,
      source_round_id: payload.sourceRoundId || null,
      source_criteria_id: payload.sourceCriteriaId || null,
      tie_break: payload.tieBreak || null,
      display_order: Number.isFinite(Number(payload.displayOrder)) ? Number(payload.displayOrder) : 0,
    })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  recordEventActivity({
    eventId,
    action: 'competition.award.create',
    userId: organizerId,
    module: 'competition',
    details: { awardId: data.id, name: data.name, method: data.method },
  })
  return mapAward(data)
}

export async function updateAward(eventId, organizerId, awardId, payload) {
  await assertCompetitionEvent(eventId, organizerId)
  const { name, method } = validatePayload(payload)
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_AWARDS)
    .update({
      name,
      description: payload.description?.trim() || null,
      method,
      division_id: payload.divisionId || null,
      category_id: payload.categoryId || null,
      source_round_id: payload.sourceRoundId || null,
      source_criteria_id: payload.sourceCriteriaId || null,
      tie_break: payload.tieBreak || null,
    })
    .eq('id', awardId)
    .eq('event_id', eventId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Award not found')
  recordEventActivity({
    eventId,
    action: 'competition.award.update',
    userId: organizerId,
    module: 'competition',
    details: { awardId, name: data.name, method: data.method },
  })
  return mapAward(data)
}

export async function deleteAward(eventId, organizerId, awardId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_AWARDS)
    .delete()
    .eq('id', awardId)
    .eq('event_id', eventId)
  if (error) throw new ApiError(500, error.message)
  recordEventActivity({
    eventId,
    action: 'competition.award.delete',
    userId: organizerId,
    module: 'competition',
    details: { awardId },
  })
  return { success: true }
}

async function getAwardRow(eventId, awardId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_AWARDS)
    .select('*')
    .eq('id', awardId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Award not found')
  return data
}

async function countActiveJudges(eventId) {
  const { count } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .eq('is_active', true)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Award winners/progress for ALL methods.
//   score / criteria  → derived from existing rankings (no re-scoring)
//   vote / selection  → tally of judge selections (+ submitted/total progress)
// ---------------------------------------------------------------------------
export async function computeAwardWinners(eventId, organizerId) {
  const awards = await listAwards(eventId, organizerId)
  if (!awards.length) return []

  const hasDerived = awards.some((a) => a.method === 'score' || a.method === 'criteria')
  const hasInteractive = awards.some((a) => a.method === 'vote' || a.method === 'selection')

  // Rankings cache for derived awards.
  let rankingsFor = async () => ({ rankings: [] })
  if (hasDerived) {
    const { getLiveRankings } = await import('./pageant.service.js')
    const cache = new Map()
    rankingsFor = async (divisionId) => {
      const key = divisionId ?? '__all__'
      if (!cache.has(key)) cache.set(key, await getLiveRankings(eventId, organizerId, { divisionId: divisionId ?? null }))
      return cache.get(key)
    }
  }

  // Contestant lookup + eligible-judge count for interactive awards.
  let contestantById = new Map()
  let totalJudges = 0
  if (hasInteractive) {
    const { data: cs } = await getClient()
      .from(DB_TABLES.CONTESTANTS)
      .select('id, name, contestant_number, photo')
      .eq('event_id', eventId)
    contestantById = new Map((cs ?? []).map((c) => [c.id, c]))
    totalJudges = await countActiveJudges(eventId)
  }

  const out = []
  for (const a of awards) {
    if (a.method === 'score' || a.method === 'criteria') {
      const { rankings } = await rankingsFor(a.divisionId)
      let winner = null
      let best = -Infinity
      for (const r of rankings ?? []) {
        let v = null
        if (a.method === 'score' && a.sourceRoundId) {
          v = (r.perRound ?? []).find((x) => x.roundId === a.sourceRoundId)?.value ?? null
        } else if (a.method === 'criteria' && a.sourceCriteriaId) {
          v = (r.criteriaBreakdown ?? []).find((x) => x.criteriaId === a.sourceCriteriaId)?.average ?? null
        }
        if (v != null && v > best) {
          best = v
          winner = { contestantId: r.contestantId, contestantName: r.contestantName, contestantNumber: r.contestantNumber, photo: r.photo, value: v }
        }
      }
      out.push({ ...a, winner, resolvable: true })
    } else {
      // vote / selection — tally
      const { data: sels } = await getClient()
        .from(DB_TABLES.COMPETITION_AWARD_SELECTIONS)
        .select('contestant_id')
        .eq('award_id', a.id)
      const counts = new Map()
      for (const s of sels ?? []) counts.set(s.contestant_id, (counts.get(s.contestant_id) ?? 0) + 1)
      let winnerId = null
      let best = -1
      let tie = false
      for (const [cid, n] of counts) {
        if (n > best) { best = n; winnerId = cid; tie = false }
        else if (n === best) tie = true
      }
      const c = winnerId ? contestantById.get(winnerId) : null
      out.push({
        ...a,
        winner: c ? { contestantId: c.id, contestantName: c.name, contestantNumber: c.contestant_number, photo: c.photo, value: best } : null,
        votes: winnerId ? best : 0,
        tie,
        submitted: (sels ?? []).length,
        totalJudges,
        resolvable: true,
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Interactive lifecycle (organizer): open / close / finalize
// ---------------------------------------------------------------------------
export async function setAwardStatus(eventId, organizerId, awardId, status) {
  await assertCompetitionEvent(eventId, organizerId)
  if (!['draft', 'open', 'closed', 'finalized'].includes(status)) {
    throw new ApiError(400, 'Invalid award status')
  }
  const award = await getAwardRow(eventId, awardId)
  if (award.method !== 'vote' && award.method !== 'selection') {
    throw new ApiError(400, 'Only Vote / Judge Selection awards have a live status')
  }
  const patch = { status }
  if (status === 'finalized') patch.finalized_at = new Date().toISOString()
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_AWARDS)
    .update(patch)
    .eq('id', awardId)
    .eq('event_id', eventId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  emitToEvent(eventId, 'award:status-changed', { award: mapAward(data) })
  recordEventActivity({
    eventId,
    action: 'competition.award.status.set',
    userId: organizerId,
    module: 'competition',
    details: { awardId, status },
  })
  return mapAward(data)
}

// ---------------------------------------------------------------------------
// Judge: submit a selection for an OPEN interactive award (upsert → replace)
// ---------------------------------------------------------------------------
export async function submitAwardSelection(eventId, judgeId, awardId, contestantId) {
  const { assertJudgeEnrolled } = await import('./pageant.service.js')
  await assertJudgeEnrolled(eventId, judgeId)

  const award = await getAwardRow(eventId, awardId)
  if (award.method !== 'vote' && award.method !== 'selection') {
    throw new ApiError(400, 'This award does not accept selections')
  }
  if (award.status !== 'open') throw new ApiError(400, 'This award is not open for selection')

  const { data: contestant } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id, division_id')
    .eq('id', contestantId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!contestant) throw new ApiError(400, 'Invalid contestant')
  if (award.division_id && contestant.division_id !== award.division_id) {
    throw new ApiError(400, 'Contestant is not in this award’s division')
  }

  const now = new Date().toISOString()
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_AWARD_SELECTIONS)
    .upsert(
      { award_id: awardId, event_id: eventId, judge_id: judgeId, contestant_id: contestantId, is_locked: true, locked_at: now, updated_at: now },
      { onConflict: 'award_id,judge_id' },
    )
  if (error) throw new ApiError(500, error.message)

  emitToEventOrganizer(eventId, 'award:selection-submitted', { awardId, judgeId })
  recordEventActivity({
    eventId,
    action: 'competition.award.selection.submit',
    userId: judgeId,
    module: 'competition',
    details: { awardId, contestantId },
  })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Judge: the interactive awards currently OPEN + this judge's pick + choices
// ---------------------------------------------------------------------------
export async function getJudgeAwardTasks(eventId, judgeId) {
  const { assertJudgeEnrolled } = await import('./pageant.service.js')
  await assertJudgeEnrolled(eventId, judgeId)

  const { data: awards } = await getClient()
    .from(DB_TABLES.COMPETITION_AWARDS)
    .select('*')
    .eq('event_id', eventId)
    .in('method', ['vote', 'selection'])
    .eq('status', 'open')
    .order('display_order', { ascending: true })
  if (!awards?.length) return []

  const { data: sels } = await getClient()
    .from(DB_TABLES.COMPETITION_AWARD_SELECTIONS)
    .select('award_id, contestant_id')
    .eq('event_id', eventId)
    .eq('judge_id', judgeId)
  const selByAward = new Map((sels ?? []).map((s) => [s.award_id, s.contestant_id]))

  const out = []
  for (const a of awards) {
    let q = getClient()
      .from(DB_TABLES.CONTESTANTS)
      .select('id, name, contestant_number, photo, division_id')
      .eq('event_id', eventId)
      .order('contestant_number', { ascending: true })
    if (a.division_id) q = q.eq('division_id', a.division_id)
    const { data: contestants } = await q
    out.push({
      ...mapAward(a),
      contestants: (contestants ?? []).map((c) => ({ id: c.id, name: c.name, contestantNumber: c.contestant_number, photo: c.photo })),
      mySelection: selByAward.get(a.id) ?? null,
    })
  }
  return out
}
