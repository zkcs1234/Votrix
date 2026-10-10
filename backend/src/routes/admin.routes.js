import { Router } from 'express'
import { authenticate, authorize, requirePasswordChanged } from '../middleware/auth.js'
import { USER_ROLES } from '../utils/constants.js'
import { adminActionLimiter, csvImportLimiter } from '../middleware/rateLimiter.js'
import { uploadSingle } from '../middleware/upload.js'
import * as adminController from '../controllers/admin.controller.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'

const router = Router()
router.use(validateRouteUUIDParams)

router.use(authenticate, authorize(USER_ROLES.ADMIN), requirePasswordChanged)

router.get('/overview', adminController.getAdminOverview)
router.get('/dashboard', adminController.getDashboard)
router.get('/analytics', adminController.getAnalytics)

router.get('/organizers', adminController.getOrganizers)
router.get('/organizers/template', adminController.getOrganizerCsvTemplate)
router.post('/organizers', adminActionLimiter, adminController.createOrganizerAccount)
router.post('/organizers/import-preview', csvImportLimiter, uploadSingle('file'), adminController.previewOrganizersCsv)
router.post('/organizers/import-register', csvImportLimiter, adminController.registerOrganizersCsv)
router.get('/organizers/:organizerId/activity', adminController.getOrganizerActivity)
router.patch('/organizers/:organizerId', adminActionLimiter, adminController.updateOrganizer)
router.patch('/organizers/:organizerId/status', adminActionLimiter, adminController.updateOrganizerStatus)
router.post('/organizers/:organizerId/send-onboarding', adminActionLimiter, adminController.sendOrganizerOnboarding)

router.get('/events', adminController.getGlobalEvents)
router.patch('/events/:eventId/restore', adminActionLimiter, adminController.restoreEvent)

// Voter (student participant) registration — plan Phase 3.
router.get('/voters', adminController.getVoters)
router.get('/voters/template', adminController.getVoterCsvTemplate)
router.post('/voters', adminActionLimiter, adminController.createVoter)
router.post('/voters/import-preview', csvImportLimiter, uploadSingle('file'), adminController.previewVotersCsv)
router.post('/voters/import-register', csvImportLimiter, adminController.registerVotersCsv)
router.patch('/voters/:userId', adminActionLimiter, adminController.updateVoter)
router.patch('/voters/:userId/status', adminActionLimiter, adminController.updateVoterStatus)
router.delete('/voters/:userId/membership', adminActionLimiter, adminController.removeVoterFromPool)

// Polling respondents have an independent pool but reuse participant accounts.
router.get('/respondents', adminController.getRespondents)
router.get('/respondents/template', adminController.getRespondentCsvTemplate)
router.post('/respondents', adminActionLimiter, adminController.createRespondent)
router.post('/respondents/import-preview', csvImportLimiter, uploadSingle('file'), adminController.previewRespondentsCsv)
router.post('/respondents/import-register', csvImportLimiter, adminController.registerRespondentsCsv)
router.patch('/respondents/:userId', adminActionLimiter, adminController.updateRespondent)
router.patch('/respondents/:userId/status', adminActionLimiter, adminController.updateRespondentStatus)
router.delete('/respondents/:userId/membership', adminActionLimiter, adminController.removeRespondentFromPool)

// Judge registration — plan Phase 4.
router.get('/judges', adminController.getJudges)
router.get('/judges/template', adminController.getJudgeCsvTemplate)
router.post('/judges', adminActionLimiter, adminController.createJudge)
router.post('/judges/import-preview', csvImportLimiter, uploadSingle('file'), adminController.previewJudgesCsv)
router.post('/judges/import-register', csvImportLimiter, adminController.registerJudgesCsv)
router.patch('/judges/:userId', adminActionLimiter, adminController.updateJudge)
router.patch('/judges/:userId/status', adminActionLimiter, adminController.updateJudgeStatus)
router.delete('/judges/:userId/membership', adminActionLimiter, adminController.removeJudgeFromPool)

router.get('/settings', adminController.getSystemSettings)
router.put('/settings', adminController.updateSystemSettings)

// Managed participant taxonomy — valid Programs and Year & Sections (plan D13).
router.get('/settings/taxonomy', adminController.getParticipantTaxonomy)
router.put('/settings/taxonomy', adminActionLimiter, adminController.updateParticipantTaxonomy)

router.get('/audit-logs', adminController.getAuditLogs)
router.get('/email-delivery-logs', adminController.getEmailDeliveryLogs)

router.get('/health', adminController.getSystemHealth)

router.get('/alerts/config', adminController.getAlertConfig)
router.put('/alerts/config', adminActionLimiter, adminController.updateAlertConfig)

router.get('/export/organizers', adminActionLimiter, adminController.exportOrganizersData)
router.get('/export/voters', adminActionLimiter, adminController.exportVotersData)
router.get('/export/respondents', adminActionLimiter, adminController.exportRespondentsData)
router.get('/export/judges', adminActionLimiter, adminController.exportJudgesData)
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
