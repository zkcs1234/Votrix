import { Router } from 'express'
import { authenticate, authorize, requireActiveAccount, requirePasswordChanged, requireProfileComplete } from '../middleware/auth.js'
import { USER_ROLES } from '../utils/constants.js'
import { emailLimiter, uploadLimiter } from '../middleware/rateLimiter.js'
import { uploadImage } from '../middleware/upload.js'
import * as organizerController from '../controllers/organizer.controller.js'
import * as organizerProfileController from '../controllers/organizer-profile.controller.js'
import electionOrganizerRoutes from './election-organizer.routes.js'
import pageantOrganizerRoutes from './pageant-organizer.routes.js'
import pollingOrganizerRoutes from './polling-organizer.routes.js'
import reportsOrganizerRoutes from './reports-organizer.routes.js'

const router = Router()

router.use(authenticate, authorize(USER_ROLES.ORGANIZER), requireActiveAccount)

// Profile routes — placed BEFORE requirePasswordChanged so that organizers
// can access their profile even if they haven't changed their password yet.
router.get('/profile', organizerProfileController.getProfile)
router.put('/profile', organizerProfileController.updateProfile)
router.get('/profile/status', organizerProfileController.getProfileStatus)

router.use(requirePasswordChanged)

// Module routes — require profile complete
router.use('/election', requireProfileComplete, electionOrganizerRoutes)
// Competition module routes (renamed from 'pageant')
router.use('/competition', requireProfileComplete, pageantOrganizerRoutes)
router.use('/polling', requireProfileComplete, pollingOrganizerRoutes)
router.use('/reports', requireProfileComplete, reportsOrganizerRoutes)

// General organizer routes — require profile complete
router.get('/overview', requireProfileComplete, organizerController.getOrganizerOverview)
router.get('/dashboard', requireProfileComplete, organizerController.getDashboard)
router.get('/analytics', requireProfileComplete, organizerController.getAnalytics)

// Single centralized org logo endpoint (replaces the 3 module-specific ones)
router.post('/organization/logo', requireProfileComplete, uploadLimiter, uploadImage('logo'), organizerController.uploadOrganizationLogo)

// Voter management routes
router.post('/events/:eventId/voters/invite', requireProfileComplete, emailLimiter, organizerController.inviteVoter)
router.post(
  '/events/:eventId/voters/:voterId/resend-invitation',
  requireProfileComplete,
  emailLimiter,
  organizerController.resendInvitation,
)
router.post('/events/:eventId/notify', requireProfileComplete, emailLimiter, organizerController.sendEventNotification)

export default router
