import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { getSupabase } from '../config/database.js'
import { DB_TABLES } from '../utils/constants.js'
import * as competitionService from '../services/competition.service.js'
import {
  validateCategory,
  validateRound,
  validateScoringConfig,
  validateJudgeRole,
  validateAssignment,
} from '../validators/competition.validator.js'
import { validateInviteVoter } from '../validators/email.validator.js'

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const listCategories = asyncHandler(async (req, res) => {
  const categories = await competitionService.listCategories(req.params.eventId, req.user.id)
  res.json({ success: true, categories })
})

export const createCategory = asyncHandler(async (req, res) => {
  const payload = validateCategory(req.body)
  const category = await competitionService.createCategory(req.params.eventId, req.user.id, payload)
  res.status(201).json({ success: true, category })
})

export const updateCategory = asyncHandler(async (req, res) => {
  const payload = validateCategory(req.body)
  const category = await competitionService.updateCategory(
    req.params.eventId,
    req.user.id,
    req.params.categoryId,
    payload,
  )
  res.json({ success: true, category })
})

export const deleteCategory = asyncHandler(async (req, res) => {
  await competitionService.deleteCategory(req.params.eventId, req.user.id, req.params.categoryId)
  res.json({ success: true, message: 'Category deleted' })
})

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------
export const listRounds = asyncHandler(async (req, res) => {
  const rounds = await competitionService.listRounds(req.params.eventId, req.user.id)
  res.json({ success: true, rounds })
})

export const createRound = asyncHandler(async (req, res) => {
  const payload = validateRound(req.body)
  const round = await competitionService.createRound(req.params.eventId, req.user.id, payload)
  res.status(201).json({ success: true, round })
})

export const updateRound = asyncHandler(async (req, res) => {
  const payload = validateRound(req.body)
  const round = await competitionService.updateRound(
    req.params.eventId,
    req.user.id,
    req.params.roundId,
    payload,
  )
  res.json({ success: true, round })
})

export const deleteRound = asyncHandler(async (req, res) => {
  await competitionService.deleteRound(req.params.eventId, req.user.id, req.params.roundId)
  res.json({ success: true, message: 'Round deleted' })
})

// ---------------------------------------------------------------------------
// Round memberships
// ---------------------------------------------------------------------------
export const addRoundContestant = asyncHandler(async (req, res) => {
  await competitionService.addContestantToRound(
    req.params.eventId,
    req.user.id,
    req.params.roundId,
    req.params.contestantId,
  )
  res.status(201).json({ success: true, message: 'Contestant added to round' })
})

export const removeRoundContestant = asyncHandler(async (req, res) => {
  await competitionService.removeContestantFromRound(
    req.params.eventId,
    req.user.id,
    req.params.roundId,
    req.params.contestantId,
  )
  res.json({ success: true, message: 'Contestant removed from round' })
})

export const addRoundCriteria = asyncHandler(async (req, res) => {
  await competitionService.addCriteriaToRound(
    req.params.eventId,
    req.user.id,
    req.params.roundId,
    req.params.criteriaId,
  )
  res.status(201).json({ success: true, message: 'Criteria added to round' })
})

export const removeRoundCriteria = asyncHandler(async (req, res) => {
  await competitionService.removeCriteriaFromRound(
    req.params.eventId,
    req.user.id,
    req.params.roundId,
    req.params.criteriaId,
  )
  res.json({ success: true, message: 'Criteria removed from round' })
})

// ---------------------------------------------------------------------------
// Scoring config (Phase 5)
// ---------------------------------------------------------------------------
export const getScoringConfig = asyncHandler(async (req, res) => {
  await competitionService.assertCompetitionEvent(req.params.eventId, req.user.id)
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('scoring_config')
    .eq('id', req.params.eventId)
    .single()
  if (error) throw new ApiError(500, error.message)
  res.json({
    success: true,
    config: competitionService.mergeScoringConfig(data.scoring_config),
  })
})

export const setScoringConfig = asyncHandler(async (req, res) => {
  await competitionService.assertCompetitionEvent(req.params.eventId, req.user.id)
  const partial = validateScoringConfig(req.body)
  const current = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('scoring_config')
    .eq('id', req.params.eventId)
    .single()
  if (current.error) throw new ApiError(500, current.error.message)
  const merged = competitionService.mergeScoringConfig({
    ...(current.data?.scoring_config ?? {}),
    ...partial,
  })
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ scoring_config: merged })
    .eq('id', req.params.eventId)
    .select('scoring_config')
    .single()
  if (error) throw new ApiError(500, error.message)
  res.json({ success: true, config: merged })
})

// ---------------------------------------------------------------------------
// First-class judges + assignments (Phase 6 API surface lives here too).
// ---------------------------------------------------------------------------
export const listJudgesV2 = asyncHandler(async (req, res) => {
  const judges = await competitionService.listCompetitionJudges(req.params.eventId, req.user.id)
  res.json({ success: true, judges })
})

export const inviteJudgeV2 = asyncHandler(async (req, res) => {
  const base = validateInviteVoter(req.body)
  const rolePayload = validateJudgeRole(req.body)
  const result = await competitionService.inviteCompetitionJudge(
    req.params.eventId,
    req.user.id,
    {
      email: base.email,
      temporaryPassword: base.temporaryPassword,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      role: rolePayload.role,
    },
  )
  res.status(201).json({ success: true, judge: result })
})

export const updateJudgeV2 = asyncHandler(async (req, res) => {
  const rolePayload = validateJudgeRole(req.body)
  const judge = await competitionService.updateCompetitionJudge(
    req.params.eventId,
    req.user.id,
    req.params.judgeId,
    rolePayload,
  )
  res.json({ success: true, judge })
})

export const deleteJudgeV2 = asyncHandler(async (req, res) => {
  await competitionService.deleteCompetitionJudge(
    req.params.eventId,
    req.user.id,
    req.params.judgeId,
  )
  res.json({ success: true, message: 'Judge removed' })
})

export const listJudgeAssignments = asyncHandler(async (req, res) => {
  const assignments = await competitionService.listJudgeAssignments(
    req.params.eventId,
    req.user.id,
    req.params.judgeId,
  )
  res.json({ success: true, assignments })
})

export const createJudgeAssignment = asyncHandler(async (req, res) => {
  const payload = validateAssignment(req.body)
  const assignment = await competitionService.createJudgeAssignment(
    req.params.eventId,
    req.user.id,
    req.params.judgeId,
    payload,
  )
  res.status(201).json({ success: true, assignment })
})

export const deleteJudgeAssignment = asyncHandler(async (req, res) => {
  await competitionService.deleteJudgeAssignment(
    req.params.eventId,
    req.user.id,
    req.params.judgeId,
    req.params.assignmentId,
  )
  res.json({ success: true, message: 'Assignment removed' })
})

// ---------------------------------------------------------------------------
// Full snapshot: returns categories, rounds, criteria, contestants, judges,
// assignments, and the scoring config in one round-trip. Used by the
// organizer's competition workspace page so the UI can render the entire
// dynamic structure without N+1 calls.
// ---------------------------------------------------------------------------
export const getFoundation = asyncHandler(async (req, res) => {
  const eventId = req.params.eventId
  await competitionService.assertCompetitionEvent(eventId, req.user.id)

  const [eventRes, cats, rounds, criteria, contestants, judges, assignments, roundLinks] =
    await Promise.all([
      getClient()
        .from(DB_TABLES.EVENTS)
        .select('id, title, scoring_config, scoring_enabled, event_type')
        .eq('id', eventId)
        .single(),
      competitionService.listCategories(eventId, req.user.id),
      competitionService.listRounds(eventId, req.user.id),
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
      competitionService.listCompetitionJudges(eventId, req.user.id),
      getClient()
        .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
        .select('id, judge_id, scope, scope_id, competition_judges!inner(event_id)')
        .eq('competition_judges.event_id', eventId),
      Promise.all([
        getClient().from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS).select('round_id, contestant_id'),
        getClient().from(DB_TABLES.COMPETITION_ROUND_CRITERIA).select('round_id, criteria_id'),
      ]).then(([rc, cr]) => ({ contestants: rc.data ?? [], criteria: cr.data ?? [] })),
    ])

  if (eventRes.error) throw new ApiError(500, eventRes.error.message)
  if (criteria.error) throw new ApiError(500, criteria.error.message)
  if (contestants.error) throw new ApiError(500, contestants.error.message)
  if (assignments.error) throw new ApiError(500, assignments.error.message)

  res.json({
    success: true,
    foundation: {
      event: eventRes.data,
      scoringConfig: competitionService.mergeScoringConfig(eventRes.data.scoring_config),
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
    },
  })
})
