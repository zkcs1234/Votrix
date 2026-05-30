import { Router } from 'express'
import { submitLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/election-voter.controller.js'

const router = Router()

router.get('/events', ctrl.listMyEvents)
router.get('/events/:eventId/ballot', ctrl.getBallot)
router.post('/events/:eventId/vote', submitLimiter, ctrl.submitVote)

export default router
