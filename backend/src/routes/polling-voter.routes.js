import { Router } from 'express'
import { pollLimiters } from '../middleware/rateLimiter.js'
import { requireEventParticipant } from '../middleware/auth.js'
import { POLLING_PARTICIPANT_TYPES } from '../utils/constants.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'
import { requireOperationalEvent } from '../middleware/eventGuards.js'
import * as ctrl from '../controllers/polling-voter.controller.js'

const router = Router()
router.use(validateRouteUUIDParams)

router.get('/events', ctrl.listMyPolls)
router.get('/events/:eventId', requireEventParticipant(...POLLING_PARTICIPANT_TYPES), ctrl.getPoll)
router.get('/events/:eventId/results', requireEventParticipant(...POLLING_PARTICIPANT_TYPES), ctrl.getPollResults)
router.post('/events/:eventId/submit', requireEventParticipant(...POLLING_PARTICIPANT_TYPES), requireOperationalEvent, pollLimiters.ip, pollLimiters.user, ctrl.submitPoll)

export default router
