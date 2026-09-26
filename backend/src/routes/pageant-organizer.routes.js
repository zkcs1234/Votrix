import { Router } from 'express'
import { uploadImage } from '../middleware/upload.js'
import { uploadLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/pageant-organizer.controller.js'
import * as draftCtrl from '../controllers/draft.controller.js'
import competitionRoutes from './competition-organizer.routes.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'
import { requireEditableEvent } from '../middleware/eventGuards.js'

const router = Router()
router.use(validateRouteUUIDParams)
// Lock editing once an event is completed/cancelled (read-only View). Placed
// before the event routes and the competition sub-router mount below so it
// guards event-detail edits AND the competition setup sub-resources; the
// live-session controls under /session/ are exempt (see requireEditableEvent).
router.use('/events/:eventId', requireEditableEvent)

router.get('/dashboard', ctrl.getDashboard)
router.get('/templates', ctrl.listTemplates)
router.get('/events', ctrl.listEvents)
router.post('/events', ctrl.createEvent)
router.get('/events/:eventId', ctrl.getEvent)
router.patch('/events/:eventId', ctrl.updateEvent)
router.patch('/events/:eventId/scoring', ctrl.setScoring)
router.post('/events/:eventId/publish', ctrl.publishEvent)
router.post('/events/:eventId/unpublish', ctrl.unpublishEvent)
router.post('/events/:eventId/banner', uploadLimiter, uploadImage('banner'), ctrl.uploadBanner)

router.get('/events/:eventId/contestants', ctrl.listContestants)
router.get('/events/:eventId/contestants/next-number', ctrl.getNextContestantNumber)
router.post('/events/:eventId/contestants', ctrl.createContestant)
router.patch('/events/:eventId/contestants/:contestantId', ctrl.updateContestant)
router.delete('/events/:eventId/contestants/:contestantId', ctrl.deleteContestant)
router.post(
  '/events/:eventId/contestants/:contestantId/photo',
  uploadLimiter,
  uploadImage('photo'),
  ctrl.uploadContestantPhoto,
)

router.get('/events/:eventId/criteria', ctrl.listCriteria)
router.post('/events/:eventId/criteria', ctrl.createCriteria)
router.patch('/events/:eventId/criteria/:criteriaId', ctrl.updateCriteria)
router.delete('/events/:eventId/criteria/:criteriaId', ctrl.deleteCriteria)

// Minor criteria (judges score these; each owns its score type)
router.get('/events/:eventId/criteria/:criteriaId/minor-criteria', ctrl.listMinorCriteria)
router.post('/events/:eventId/criteria/:criteriaId/minor-criteria', ctrl.createMinorCriteria)
router.patch('/events/:eventId/criteria/:criteriaId/minor-criteria/:minorCriteriaId', ctrl.updateMinorCriteria)
router.delete('/events/:eventId/criteria/:criteriaId/minor-criteria/:minorCriteriaId', ctrl.deleteMinorCriteria)

router.get('/events/:eventId/judges', ctrl.listJudges)

// Plan Phase 6: judge accounts are created by the admin; organizers pick judges
// from the pool via /events/:eventId/judge-pool + /judges-v2/pick (see
// competition-organizer.routes.js). The old judge invite / register /
// send-invitation / send-all / import-preview / import-register routes were
// removed here.

router.get('/events/:eventId/rankings', ctrl.getRankings)
router.get('/events/:eventId/results', ctrl.getResults)
router.get('/events/:eventId/analytics', ctrl.getAnalytics)

// Phase 4-6 dynamic scoring engine: categories, rounds, scoring config,
// judge participants, and flexible assignments live under
// `/events/:eventId/...` and share the auth middleware on the parent router.
router.use('/events/:eventId', competitionRoutes)

// ——— Persistent Create Draft (one per organizer + module) ———
router.get('/drafts', draftCtrl.getDraft('competition'))
router.put('/drafts', draftCtrl.saveDraft('competition'))
router.delete('/drafts', draftCtrl.deleteDraft('competition'))
router.post('/drafts/publish', draftCtrl.publishDraft('competition'))
router.post('/drafts/banner', uploadLimiter, uploadImage('banner'), draftCtrl.uploadBanner('competition'))

export default router
