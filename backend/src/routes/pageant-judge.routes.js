import { Router } from 'express'
import { scoreLimiters } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/pageant-judge.controller.js'
import * as sessionCtrl from '../controllers/competition-session.controller.js'

const router = Router()

router.get('/events', ctrl.listMyEvents)
router.get('/events/:eventId/score', ctrl.getScoringSheet)
router.post('/events/:eventId/score', scoreLimiters.ip, scoreLimiters.user, ctrl.submitScores)

// Live session judge endpoints
router.get('/events/:eventId/session-view', sessionCtrl.getJudgeSessionView)
router.post('/events/:eventId/session-score', scoreLimiters.ip, scoreLimiters.user, sessionCtrl.submitJudgeSessionScore)

export default router
