import { Router } from 'express'
import { voteLimiters } from '../middleware/rateLimiter.js'
import { requireEventParticipant } from '../middleware/auth.js'
import { ELECTION_PARTICIPANT_TYPES } from '../utils/constants.js'
import * as ctrl from '../controllers/election-voter.controller.js'
import { requireOperationalEvent } from '../middleware/eventGuards.js'

const router = Router()

router.get('/events', ctrl.listMyEvents)
router.get('/events/:eventId/ballot', requireEventParticipant(...ELECTION_PARTICIPANT_TYPES), ctrl.getBallot)
router.get('/events/:eventId/results', requireEventParticipant(...ELECTION_PARTICIPANT_TYPES), ctrl.getResults)
router.post('/events/:eventId/vote', requireEventParticipant(...ELECTION_PARTICIPANT_TYPES), requireOperationalEvent, voteLimiters.ip, voteLimiters.user, ctrl.submitVote)

export default router
