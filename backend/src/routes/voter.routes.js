import { Router } from 'express'
import { authenticate, authorize, requireActiveAccount, requirePasswordChanged } from '../middleware/auth.js'
import { USER_ROLES } from '../utils/constants.js'
import * as voterController from '../controllers/voter.controller.js'
import electionVoterRoutes from './election-voter.routes.js'
import pageantJudgeRoutes from './pageant-judge.routes.js'
import pollingVoterRoutes from './polling-voter.routes.js'

const router = Router()

router.use(authenticate, authorize(USER_ROLES.VOTER), requireActiveAccount, requirePasswordChanged)

router.use('/election', electionVoterRoutes)
router.use('/pageant', pageantJudgeRoutes)
router.use('/competition', pageantJudgeRoutes)
router.use('/polling', pollingVoterRoutes)

router.get('/overview', voterController.getVoterOverview)

export default router
