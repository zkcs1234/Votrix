import { Router } from 'express'
import { voteLimiters } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/election-voter.controller.js'

const router = Router()

router.get('/events', ctrl.listMyEvents)
router.get('/events/:eventId/ballot', ctrl.getBallot)
router.post('/events/:eventId/vote', voteLimiters.ip, voteLimiters.user, ctrl.submitVote)

export default router
