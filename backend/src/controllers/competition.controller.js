import { asyncHandler } from '../utils/asyncHandler.js'
import * as competitionService from '../services/competition.service.js'
import {
  validateCategory,
  validateRound,
  validateScoringConfig,
  validateJudgeRole,
  validateAssignment,
} from '../validators/competition.validator.js'
import { validateInviteVoter } from '../validators/email.validator.js'

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
  const config = await competitionService.getScoringConfig(req.params.eventId, req.user.id)
  res.json({ success: true, config })
})

export const setScoringConfig = asyncHandler(async (req, res) => {
  const partial = validateScoringConfig(req.body)
  const config = await competitionService.setScoringConfig(req.params.eventId, req.user.id, partial)
  res.json({ success: true, config })
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
  const foundation = await competitionService.getCompetitionFoundation(req.params.eventId, req.user.id)
  res.json({ success: true, foundation })
})
