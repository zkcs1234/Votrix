import { Router } from 'express'
import { emailLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/competition.controller.js'
import * as sessionCtrl from '../controllers/competition-session.controller.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'

// All routes are mounted under /api/organizer/competition/events/:eventId
// (see pageant-organizer.routes.js) and share the same auth middleware.

const router = Router({ mergeParams: true })
router.use(validateRouteUUIDParams)

// Divisions
router.get('/divisions', ctrl.listDivisions)
router.post('/divisions', ctrl.createDivision)
router.get('/divisions/:divisionId', ctrl.getDivision)
router.patch('/divisions/:divisionId', ctrl.updateDivision)
router.delete('/divisions/:divisionId', ctrl.deleteDivision)
router.patch('/divisions-enabled', ctrl.setDivisionsEnabled)

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

// Judge participants (Phase 6) — canonical event_participants-backed model.
router.get('/judges-v2', ctrl.listJudgesV2)
router.post('/judges-v2/invite', emailLimiter, ctrl.inviteJudgeV2)
router.patch('/judges-v2/:judgeId', ctrl.updateJudgeV2)
router.delete('/judges-v2/:judgeId', ctrl.deleteJudgeV2)

// Judge assignments
router.get('/judges-v2/:judgeId/assignments', ctrl.listJudgeAssignments)
router.post('/judges-v2/:judgeId/assignments', ctrl.createJudgeAssignment)
router.delete('/judges-v2/:judgeId/assignments/:assignmentId', ctrl.deleteJudgeAssignment)

// ---------------------------------------------------------------------------
// Live Competition Session (Phase 7)
// ---------------------------------------------------------------------------
// Session status
router.get('/session/active', sessionCtrl.getActiveSession)
router.get('/sessions', sessionCtrl.listSessions)
router.get('/sessions/:sessionId', sessionCtrl.getSession)

// Session controls
router.post('/session/start', sessionCtrl.startSession)
router.post('/session/pause', sessionCtrl.pauseSession)
router.post('/session/resume', sessionCtrl.resumeSession)
router.post('/session/complete', sessionCtrl.completeSession)

// Contestant navigation
router.post('/session/next-contestant', sessionCtrl.nextContestant)
router.post('/session/prev-contestant', sessionCtrl.previousContestant)
router.post('/session/set-contestant', sessionCtrl.setActiveContestant)
router.post('/session/set-round', sessionCtrl.setActiveRound)
router.post('/session/set-division', sessionCtrl.setActiveDivision)

// Judge progress (organizer view)
router.get('/session/judge-progress', sessionCtrl.getJudgeProgress)

// Round finalize & advancement (Phase 6)
router.get('/rounds/:roundId/advancement-preview', sessionCtrl.previewRoundAdvancement)
router.post('/session/finalize-round', sessionCtrl.finalizeRound)
router.get('/rounds/:roundId/results', sessionCtrl.getRoundResults)

export default router
