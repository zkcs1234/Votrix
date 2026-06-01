import { Router } from 'express'
import { scoreLimiters } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/pageant-judge.controller.js'

const router = Router()

router.get('/events', ctrl.listMyEvents)
router.get('/events/:eventId/score', ctrl.getScoringSheet)
router.post('/events/:eventId/score', scoreLimiters.ip, scoreLimiters.user, ctrl.submitScores)

export default router
