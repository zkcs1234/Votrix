import { Router } from 'express'
import { pollLimiters } from '../middleware/rateLimiter.js'
import { requireEventParticipant } from '../middleware/auth.js'
import { PARTICIPANT_TYPES } from '../utils/constants.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'
import * as ctrl from '../controllers/polling-voter.controller.js'

const router = Router()
router.use(validateRouteUUIDParams)

router.get('/events', ctrl.listMyPolls)
router.get('/events/:eventId', requireEventParticipant(PARTICIPANT_TYPES.POLLING_RESPONDENT), ctrl.getPoll)
router.post('/events/:eventId/submit', requireEventParticipant(PARTICIPANT_TYPES.POLLING_RESPONDENT), pollLimiters.ip, pollLimiters.user, ctrl.submitPoll)

export default router
