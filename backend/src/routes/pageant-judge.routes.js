import { Router } from 'express'
import { judgeScoreLimiter } from '../middleware/rateLimiter.js'
import { requireEventParticipant } from '../middleware/auth.js'
import { PARTICIPANT_TYPES } from '../utils/constants.js'
import * as ctrl from '../controllers/pageant-judge.controller.js'
import * as sessionCtrl from '../controllers/competition-session.controller.js'
import * as awardCtrl from '../controllers/competition-award.controller.js'

const router = Router()

router.get('/events', ctrl.listMyEvents)
router.get('/events/:eventId/score', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), ctrl.getScoringSheet)
router.post('/events/:eventId/score', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), judgeScoreLimiter, ctrl.submitScores)

// Live session judge endpoints
router.get('/events/:eventId/session-view', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), sessionCtrl.getJudgeSessionView)
router.post('/events/:eventId/session-score', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), judgeScoreLimiter, sessionCtrl.submitJudgeSessionScore)

// Interactive award tasks (vote / judge selection)
router.get('/events/:eventId/award-tasks', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), awardCtrl.getJudgeAwardTasks)
router.post('/events/:eventId/awards/:awardId/select', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), judgeScoreLimiter, awardCtrl.submitAwardSelection)

export default router
