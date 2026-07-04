import { Router } from 'express'
import { authenticate, authorize, requirePasswordChanged } from '../middleware/auth.js'
import { USER_ROLES } from '../utils/constants.js'
import { adminActionLimiter } from '../middleware/rateLimiter.js'
import * as adminController from '../controllers/admin.controller.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'

const router = Router()
router.use(validateRouteUUIDParams)

router.use(authenticate, authorize(USER_ROLES.ADMIN), requirePasswordChanged)

router.get('/overview', adminController.getAdminOverview)
router.get('/dashboard', adminController.getDashboard)
router.get('/analytics', adminController.getAnalytics)

router.get('/organizers', adminController.getOrganizers)
router.post('/organizers', adminActionLimiter, adminController.createOrganizerAccount)
router.patch('/organizers/:organizerId/status', adminActionLimiter, adminController.updateOrganizerStatus)

router.get('/events', adminController.getGlobalEvents)

router.get('/settings', adminController.getSystemSettings)
router.put('/settings', adminController.updateSystemSettings)

router.get('/audit-logs', adminController.getAuditLogs)

export default router
