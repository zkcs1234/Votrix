import { Router } from 'express'
import { submitLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/polling-voter.controller.js'

const router = Router()

router.get('/events', ctrl.listMyPolls)
router.get('/events/:eventId', ctrl.getPoll)
router.post('/events/:eventId/submit', submitLimiter, ctrl.submitPoll)

export default router
