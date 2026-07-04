import { Router } from 'express'
import { emailLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/competition.controller.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'

// All routes are mounted under /api/organizer/competition/events/:eventId
// (see pageant-organizer.routes.js) and share the same auth middleware.

const router = Router({ mergeParams: true })
router.use(validateRouteUUIDParams)

// Categories
router.get('/categories', ctrl.listCategories)
router.post('/categories', ctrl.createCategory)
router.patch('/categories/:categoryId', ctrl.updateCategory)
router.delete('/categories/:categoryId', ctrl.deleteCategory)

// Rounds
router.get('/rounds', ctrl.listRounds)
router.post('/rounds', ctrl.createRound)
router.patch('/rounds/:roundId', ctrl.updateRound)
router.delete('/rounds/:roundId', ctrl.deleteRound)

// Round memberships
router.post('/rounds/:roundId/contestants/:contestantId', ctrl.addRoundContestant)
router.delete('/rounds/:roundId/contestants/:contestantId', ctrl.removeRoundContestant)
router.post('/rounds/:roundId/criteria/:criteriaId', ctrl.addRoundCriteria)
router.delete('/rounds/:roundId/criteria/:criteriaId', ctrl.removeRoundCriteria)

// Scoring config (Phase 5)
router.get('/scoring-config', ctrl.getScoringConfig)
router.patch('/scoring-config', ctrl.setScoringConfig)

// Foundation snapshot (used by the workspace UI)
router.get('/foundation', ctrl.getFoundation)

// First-class judges (Phase 6) — co-located with the legacy /judges endpoints
router.get('/judges-v2', ctrl.listJudgesV2)
router.post('/judges-v2/invite', emailLimiter, ctrl.inviteJudgeV2)
router.patch('/judges-v2/:judgeId', ctrl.updateJudgeV2)
router.delete('/judges-v2/:judgeId', ctrl.deleteJudgeV2)

// Judge assignments
router.get('/judges-v2/:judgeId/assignments', ctrl.listJudgeAssignments)
router.post('/judges-v2/:judgeId/assignments', ctrl.createJudgeAssignment)
router.delete('/judges-v2/:judgeId/assignments/:assignmentId', ctrl.deleteJudgeAssignment)

export default router
