import { Router } from 'express'
import { uploadSingle, uploadImage } from '../middleware/upload.js'
import { uploadLimiter, csvImportLimiter, emailLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/polling-organizer.controller.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'

const router = Router()
router.use(validateRouteUUIDParams)

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

// Question type registry
router.get('/question-types', ctrl.listQuestionTypes)
router.get('/question-types/custom', ctrl.listCustomQuestionTypes)
router.post('/question-types/custom', ctrl.createCustomQuestionType)
router.patch('/question-types/custom/:typeId', ctrl.updateCustomQuestionType)
router.delete('/question-types/custom/:typeId', ctrl.deleteCustomQuestionType)

// List respondents
router.get('/events/:eventId/voters', ctrl.listRespondents)

// Registration and Invitation separated
router.post('/events/:eventId/respondents/register', emailLimiter, ctrl.registerRespondent)
router.post('/events/:eventId/respondents/register-existing', emailLimiter, ctrl.registerExistingRespondent)
router.post('/events/:eventId/respondents/:voterId/send-invitation', emailLimiter, ctrl.sendRespondentInvitation)
router.post('/events/:eventId/respondents/send-all', emailLimiter, ctrl.sendAllRespondentInvitations)
router.post('/events/:eventId/respondents/import-preview', csvImportLimiter, uploadSingle('file'), ctrl.previewRespondentsCsv)
router.post('/events/:eventId/respondents/import-register', csvImportLimiter, ctrl.registerRespondentsCsv)

export default router
