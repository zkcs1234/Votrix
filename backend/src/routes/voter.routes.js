import { Router } from 'express'
import { authenticate, authorize, requireActiveAccount, requirePasswordChanged } from '../middleware/auth.js'
import { requireEventParticipant } from '../middleware/auth.js'
import { USER_ROLES } from '../utils/constants.js'
import * as voterController from '../controllers/voter.controller.js'
import electionVoterRoutes from './election-voter.routes.js'
import pageantJudgeRoutes from './pageant-judge.routes.js'
import pollingVoterRoutes from './polling-voter.routes.js'

const router = Router()

router.use(authenticate, authorize(USER_ROLES.VOTER), requireActiveAccount, requirePasswordChanged)

// Module-specific sub-routers (protected by legacy enrollment checks)
router.use('/election', electionVoterRoutes)
// Competition scoring routes for judges
router.use('/competition', pageantJudgeRoutes)
router.use('/polling', pollingVoterRoutes)

// Participant role endpoints
router.get('/participant-types', voterController.getMyParticipantTypes)
router.get('/events/:eventId/my-role', voterController.getMyEventRole)
router.patch('/events/:eventId/participant-information', voterController.updateMyParticipantInformation)

// Dashboard & redirect
router.get('/overview', voterController.getVoterOverview)
router.get('/login-redirect', voterController.getVoterLoginRedirect)

export default router
