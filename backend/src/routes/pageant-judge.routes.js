import { Router } from 'express'
import { judgeScoreLimiter } from '../middleware/rateLimiter.js'
import { requireEventParticipant } from '../middleware/auth.js'
import { PARTICIPANT_TYPES } from '../utils/constants.js'
import * as ctrl from '../controllers/pageant-judge.controller.js'
import * as sessionCtrl from '../controllers/competition-session.controller.js'

const router = Router()

router.get('/events', ctrl.listMyEvents)
router.get('/events/:eventId/score', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), ctrl.getScoringSheet)
router.post('/events/:eventId/score', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), judgeScoreLimiter, ctrl.submitScores)

// Live session judge endpoints
router.get('/events/:eventId/session-view', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), sessionCtrl.getJudgeSessionView)
router.post('/events/:eventId/session-score', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), judgeScoreLimiter, sessionCtrl.submitJudgeSessionScore)

export default router
