import { Router } from 'express'
import { uploadImage } from '../middleware/upload.js'
import { uploadLimiter, emailLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/polling-organizer.controller.js'
import * as draftCtrl from '../controllers/draft.controller.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'
import { requireEditableEvent } from '../middleware/eventGuards.js'

const router = Router()
router.use(validateRouteUUIDParams)
// Lock editing once an event is completed/cancelled (read-only View).
router.use('/events/:eventId', requireEditableEvent)

router.get('/dashboard', ctrl.getDashboard)
router.get('/events', ctrl.listEvents)
router.post('/events', ctrl.createEvent)
router.patch('/events/:eventId', ctrl.updateEvent)
router.get('/events/:eventId/settings', ctrl.getSettings)
router.post('/events/:eventId/publish', ctrl.publishEvent)
router.post('/events/:eventId/unpublish', ctrl.unpublishEvent)
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

// Cohort invite (plan Phase 5). Organizers invite existing students by cohort;
// the admin owns account registration. The old register / register-existing /
// send-invitation / send-all / import-preview / import-register routes were
// removed here.
router.get('/events/:eventId/cohorts', ctrl.getCohorts)
router.post('/events/:eventId/invite-cohort', emailLimiter, ctrl.inviteCohort)
router.delete('/events/:eventId/participants/:userId', ctrl.removeParticipant)

// ——— Persistent Create Draft (one per organizer + module) ———
router.get('/drafts', draftCtrl.getDraft('polling'))
router.put('/drafts', draftCtrl.saveDraft('polling'))
router.delete('/drafts', draftCtrl.deleteDraft('polling'))
router.post('/drafts/publish', draftCtrl.publishDraft('polling'))
router.post('/drafts/banner', uploadLimiter, uploadImage('banner'), draftCtrl.uploadBanner('polling'))

export default router
