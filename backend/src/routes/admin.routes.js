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
router.get('/organizers/:organizerId/activity', adminController.getOrganizerActivity)
router.patch('/organizers/:organizerId/status', adminActionLimiter, adminController.updateOrganizerStatus)
router.post('/organizers/:organizerId/send-onboarding', adminActionLimiter, adminController.sendOrganizerOnboarding)

router.get('/events', adminController.getGlobalEvents)

router.get('/settings', adminController.getSystemSettings)
router.put('/settings', adminController.updateSystemSettings)

router.get('/audit-logs', adminController.getAuditLogs)

router.get('/health', adminController.getSystemHealth)

router.get('/alerts/config', adminController.getAlertConfig)
router.put('/alerts/config', adminActionLimiter, adminController.updateAlertConfig)

router.get('/export/organizers', adminActionLimiter, adminController.exportOrganizersData)
router.get('/export/events', adminActionLimiter, adminController.exportEventsData)
router.get('/export/audit-logs', adminActionLimiter, adminController.exportAuditLogsData)

router.get('/sessions', adminController.listSessions)
router.delete('/sessions/:sessionId', adminActionLimiter, adminController.revokeOneSession)
router.delete('/users/:userId/sessions', adminActionLimiter, adminController.revokeAllForUser)

router.get('/search', adminController.platformSearchHandler)

router.get('/policies/archival', adminController.getArchivalPolicy)
router.put('/policies/archival', adminActionLimiter, adminController.updateArchivalPolicy)
router.post('/policies/archival/run-now', adminActionLimiter, adminController.runArchivalNow)

export default router
