import { db as getClient } from '../foundation/db.js'
import { recordAudit } from '../foundation/audit.js'
import { recordEventActivity } from '../foundation/activity.js'
import { ApiError } from '../utils/ApiError.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { getLiveRankings } from './pageant.service.js'
import { applyDeductionsToRankings } from '../modules/tabulation.js'

async function assertCompetitionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (!['pageant', 'competition_scoring'].includes(event.event_type)) {
    throw new ApiError(400, 'This event is not a competition scoring event')
  }
  return event
}

function mapDeduction(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    sessionId: row.session_id,
    roundId: row.round_id,
    contestantId: row.contestant_id,
    appliedByUserId: row.applied_by_user_id,
    authorityType: row.authority_type,
    amount: Number(row.amount),
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
  }
}

async function assertContestant(eventId, contestantId) {
  const { data, error } = await getClient()
    .from('competition_contestants')
    .select('id')
    .eq('id', contestantId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(400, 'Contestant does not belong to this event')
}

export async function listDeductions(eventId, organizerId, { includeVoided = false } = {}) {
  await assertCompetitionEvent(eventId, organizerId)
  let query = getClient()
    .from('competition_deductions')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (!includeVoided) query = query.eq('status', 'active')
  const { data, error } = await query
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapDeduction)
}

export async function createDeduction(eventId, organizerId, payload = {}) {
  const event = await assertCompetitionEvent(eventId, organizerId)
  const authority = event.scoring_config?.deductionAuthority ?? 'organizer'
  if (!['organizer', 'both'].includes(authority)) {
    throw new ApiError(403, 'Organizer deductions are disabled for this event')
  }
  const amount = Number(payload.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, 'Deduction amount must be greater than zero')
  if (!String(payload.reason ?? '').trim()) throw new ApiError(400, 'A deduction reason is required')
  await assertContestant(eventId, payload.contestantId)

  const { data, error } = await getClient()
    .from('competition_deductions')
    .insert({
      event_id: eventId,
      session_id: payload.sessionId ?? null,
      round_id: payload.roundId ?? null,
      contestant_id: payload.contestantId,
      applied_by_user_id: organizerId,
      authority_type: 'organizer',
      amount,
      reason: String(payload.reason).trim(),
    })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)

  const deduction = mapDeduction(data)
  await recordAudit({
    userId: organizerId,
    action: 'competition.deduction.create',
    entity: 'competition_deductions',
    entityId: deduction.id,
    details: { eventId, contestantId: deduction.contestantId, amount, reason: deduction.reason },
  })
  recordEventActivity({ eventId, action: 'competition.deduction.create', userId: organizerId, module: 'competition', details: deduction })
  return deduction
}

export async function voidDeduction(eventId, organizerId, deductionId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from('competition_deductions')
    .update({ status: 'voided', voided_at: new Date().toISOString(), voided_by_user_id: organizerId })
    .eq('id', deductionId)
    .eq('event_id', eventId)
    .eq('status', 'active')
    .select('*')
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Active deduction not found')
  await recordAudit({ userId: organizerId, action: 'competition.deduction.void', entity: 'competition_deductions', entityId: deductionId, details: { eventId } })
  recordEventActivity({ eventId, action: 'competition.deduction.void', userId: organizerId, module: 'competition', details: { deductionId } })
  return mapDeduction(data)
}

export async function calculateResults(eventId, organizerId, { divisionId = null, roundId = null } = {}) {
  const event = await assertCompetitionEvent(eventId, organizerId)
  const rankings = await getLiveRankings(eventId, organizerId, { divisionId, roundId })
  const deductions = await listDeductions(eventId, organizerId)
  const results = applyDeductionsToRankings(rankings.rankings, deductions, roundId)

  const configSnapshot = {
    scoringConfig: rankings.scoringConfig,
    divisionId,
    roundId,
    criteriaTotalPercentage: rankings.criteriaTotalPercentage,
    roundWeightTotal: rankings.roundWeightTotal,
    categoryWeightTotal: rankings.categoryWeightTotal,
    judges: rankings.judges,
    deductionAuthority: event.scoring_config?.deductionAuthority ?? 'organizer',
  }
  const { data, error } = await getClient()
    .from('competition_result_calculations')
    .insert({ event_id: eventId, round_id: roundId, status: 'calculated', configuration_snapshot: configSnapshot, result_snapshot: results, created_by: organizerId })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  recordEventActivity({ eventId, action: 'competition.results.calculate', userId: organizerId, module: 'competition', details: { calculationId: data.id, roundId, divisionId } })
  return { calculationId: data.id, status: data.status, configuration: configSnapshot, results }
}

export async function getCalculation(eventId, organizerId, calculationId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient().from('competition_result_calculations').select('*').eq('id', calculationId).eq('event_id', eventId).maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Calculation not found')
  return data
}

export async function getLatestCalculation(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from('competition_result_calculations')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  return data
}

export async function finalizeCalculation(eventId, organizerId, calculationId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient().from('competition_result_calculations').update({ status: 'finalized', finalized_by: organizerId, finalized_at: new Date().toISOString() }).eq('id', calculationId).eq('event_id', eventId).eq('status', 'calculated').select('*').maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(409, 'Only a calculated result can be finalized')
  await recordAudit({ userId: organizerId, action: 'competition.results.finalize', entity: 'competition_result_calculations', entityId: calculationId, details: { eventId } })
  return data
}

export async function publishCalculation(eventId, organizerId, calculationId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient().from('competition_result_calculations').update({ status: 'published', published_by: organizerId, published_at: new Date().toISOString() }).eq('id', calculationId).eq('event_id', eventId).eq('status', 'finalized').select('*').maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(409, 'Only a finalized result can be published')
  await recordAudit({ userId: organizerId, action: 'competition.results.publish', entity: 'competition_result_calculations', entityId: calculationId, details: { eventId } })
  return data
}
