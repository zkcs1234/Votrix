import { Router } from 'express'
import { voteLimiters } from '../middleware/rateLimiter.js'
import { requireEventParticipant } from '../middleware/auth.js'
import { PARTICIPANT_TYPES } from '../utils/constants.js'
import * as ctrl from '../controllers/election-voter.controller.js'

const router = Router()

router.get('/events', ctrl.listMyEvents)
router.get('/events/:eventId/ballot', requireEventParticipant(PARTICIPANT_TYPES.ELECTION_VOTER), ctrl.getBallot)
router.get('/events/:eventId/results', requireEventParticipant(PARTICIPANT_TYPES.ELECTION_VOTER), ctrl.getResults)
router.post('/events/:eventId/vote', requireEventParticipant(PARTICIPANT_TYPES.ELECTION_VOTER), voteLimiters.ip, voteLimiters.user, ctrl.submitVote)

export default router
