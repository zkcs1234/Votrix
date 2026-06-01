import { Router } from 'express'
import { uploadSingle, uploadImage } from '../middleware/upload.js'
import { uploadLimiter, csvImportLimiter, emailLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/polling-organizer.controller.js'

const router = Router()

router.get('/dashboard', ctrl.getDashboard)
router.post('/organization/logo', uploadLimiter, uploadImage('logo'), ctrl.uploadOrganizationLogo)
router.get('/events', ctrl.listEvents)
router.post('/events', ctrl.createEvent)
router.patch('/events/:eventId', ctrl.updateEvent)
router.get('/events/:eventId/settings', ctrl.getSettings)
router.patch('/events/:eventId/open', ctrl.setPollOpen)
router.post('/events/:eventId/banner', uploadLimiter, uploadImage('banner'), ctrl.uploadBanner)

router.get('/events/:eventId/questions', ctrl.listQuestions)
router.post('/events/:eventId/questions', ctrl.createQuestion)
router.patch('/events/:eventId/questions/:questionId', ctrl.updateQuestion)
router.delete('/events/:eventId/questions/:questionId', ctrl.deleteQuestion)

router.get('/events/:eventId/analytics', ctrl.getAnalytics)

router.post('/events/:eventId/respondents/invite', emailLimiter, ctrl.inviteRespondent)
router.post('/events/:eventId/respondents/import', csvImportLimiter, uploadSingle('file'), ctrl.importRespondentsCsv)

export default router
