import { Router } from 'express'
import { authenticate, authorize, requirePasswordChanged } from '../middleware/auth.js'
import { USER_ROLES } from '../utils/constants.js'
import * as organizerController from '../controllers/organizer.controller.js'
import electionOrganizerRoutes from './election-organizer.routes.js'
import pageantOrganizerRoutes from './pageant-organizer.routes.js'
import pollingOrganizerRoutes from './polling-organizer.routes.js'
import reportsOrganizerRoutes from './reports-organizer.routes.js'

const router = Router()

router.use(authenticate, authorize(USER_ROLES.ORGANIZER), requirePasswordChanged)

router.use('/election', electionOrganizerRoutes)
router.use('/pageant', pageantOrganizerRoutes)
router.use('/polling', pollingOrganizerRoutes)
router.use('/reports', reportsOrganizerRoutes)

router.get('/overview', organizerController.getOrganizerOverview)
router.get('/dashboard', organizerController.getDashboard)
router.get('/analytics', organizerController.getAnalytics)

router.post('/events/:eventId/voters/invite', organizerController.inviteVoter)
router.post(
  '/events/:eventId/voters/:voterId/resend-invitation',
  organizerController.resendInvitation,
)
router.post('/events/:eventId/notify', organizerController.sendEventNotification)

export default router
