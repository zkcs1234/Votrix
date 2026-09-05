import { Router } from 'express'
import { uploadSingle, uploadImage } from '../middleware/upload.js'
import { uploadLimiter, csvImportLimiter, emailLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/polling-organizer.controller.js'
import * as draftCtrl from '../controllers/draft.controller.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'

const router = Router()
router.use(validateRouteUUIDParams)

router.get('/dashboard', ctrl.getDashboard)
router.get('/events', ctrl.listEvents)
router.post('/events', ctrl.createEvent)
router.patch('/events/:eventId', ctrl.updateEvent)
router.get('/events/:eventId/settings', ctrl.getSettings)
router.patch('/events/:eventId/open', ctrl.setPollOpen)
router.post('/events/:eventId/publish', ctrl.publishEvent)
router.post('/events/:eventId/banner', uploadLimiter, uploadImage('banner'), ctrl.uploadBanner)
router.post('/events/:eventId/image', uploadLimiter, uploadImage('image'), ctrl.uploadGenericImage)

router.get('/events/:eventId/questions', ctrl.listQuestions)
router.post('/events/:eventId/questions', ctrl.createQuestion)
router.patch('/events/:eventId/questions/reorder', ctrl.reorderQuestions)
router.patch('/events/:eventId/questions/:questionId', ctrl.updateQuestion)
router.delete('/events/:eventId/questions/:questionId', ctrl.deleteQuestion)
router.post('/events/:eventId/questions/:questionId/duplicate', ctrl.duplicateQuestion)

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

// ——— Participant Information Form ———
router.get('/events/:eventId/information-form', ctrl.getInformationForm)
router.patch('/events/:eventId/information-form', ctrl.updateInformationForm)

// ——— Persistent Create Draft (one per organizer + module) ———
router.get('/drafts', draftCtrl.getDraft('polling'))
router.put('/drafts', draftCtrl.saveDraft('polling'))
router.delete('/drafts', draftCtrl.deleteDraft('polling'))
router.post('/drafts/publish', draftCtrl.publishDraft('polling'))
router.post('/drafts/banner', uploadLimiter, uploadImage('banner'), draftCtrl.uploadBanner('polling'))

export default router
