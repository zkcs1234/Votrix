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
import officersRoutes from './organizer-officers.routes.js'
import { resolveOrganizerContext, requireOwnerOrganizer } from '../middleware/organizerContext.js'

const router = Router()

// resolveOrganizerContext lets an ACTIVE student officer use this whole router as
// the owner organizer (see middleware/organizerContext.js). It is a no-op for
// real organizers, and a student without an officership still falls through to
// authorize(ORGANIZER) and gets the usual 403.
router.use(authenticate, resolveOrganizerContext, authorize(USER_ROLES.ORGANIZER), requireActiveAccount)

// Profile routes — placed BEFORE requirePasswordChanged so that organizers
// can access their profile even if they haven't changed their password yet.
// Reading is fine for an officer; editing the owner's profile is owner-only.
router.get('/profile', organizerProfileController.getProfile)
router.put('/profile', requireOwnerOrganizer, organizerProfileController.updateProfile)
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
router.post('/organization/logo', requireOwnerOrganizer, requireProfileComplete, uploadLimiter, uploadImage('logo'), organizerController.uploadOrganizationLogo)

// Student officers — managed by the owner organizer only.
router.use('/officers', requireProfileComplete, officersRoutes)

// Organizers no longer enroll voters by email: the admin owns accounts and
// organizers invite existing students by program through each module's
// /events/:eventId/invite-cohort route, which enforces the organizer's scope.
router.post('/events/:eventId/notify', requireProfileComplete, emailLimiter, organizerController.sendEventNotification)

export default router
