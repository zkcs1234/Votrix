import { Router } from 'express'
import { pollLimiters } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/polling-voter.controller.js'

const router = Router()

router.get('/events', ctrl.listMyPolls)
router.get('/events/:eventId', ctrl.getPoll)
router.post('/events/:eventId/submit', pollLimiters.ip, pollLimiters.user, ctrl.submitPoll)

export default router
