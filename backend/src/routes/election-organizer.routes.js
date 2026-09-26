import { Router } from 'express'
import { uploadImage } from '../middleware/upload.js'
import { uploadLimiter, emailLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/election-organizer.controller.js'
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
router.get('/events/:eventId', ctrl.getEvent)
router.patch('/events/:eventId', ctrl.updateEvent)
router.post('/events/:eventId/banner', uploadLimiter, uploadImage('banner'), ctrl.uploadBanner)

router.get('/events/:eventId/positions', ctrl.listPositions)
router.post('/events/:eventId/positions', ctrl.createPosition)
router.patch('/events/:eventId/positions/:positionId', ctrl.updatePosition)
router.delete('/events/:eventId/positions/:positionId', ctrl.deletePosition)

router.get('/events/:eventId/candidates', ctrl.listCandidates)
router.post('/events/:eventId/positions/:positionId/candidates', ctrl.createCandidate)
router.patch('/events/:eventId/candidates/:candidateId', ctrl.updateCandidate)
router.delete('/events/:eventId/candidates/:candidateId', ctrl.deleteCandidate)
router.post(
  '/events/:eventId/candidates/:candidateId/photo',
  uploadLimiter,
  uploadImage('photo'),
  ctrl.uploadCandidatePhoto,
)

router.get('/events/:eventId/voters', ctrl.listVoters)

// Cohort invite (plan Phase 5). Organizers no longer register accounts — the
// admin owns registration; organizers invite existing students by cohort.
// The old register / register-existing / send-invitation / send-all /
// import-preview / import-register routes were removed here.
router.get('/events/:eventId/cohorts', ctrl.getCohorts)
router.post('/events/:eventId/invite-cohort', emailLimiter, ctrl.inviteCohort)
router.delete('/events/:eventId/participants/:userId', ctrl.removeParticipant)

router.post('/events/:eventId/duplicate', ctrl.duplicateEvent)
router.post('/events/:eventId/finalize', ctrl.finalizeEvent)
router.post('/events/:eventId/publish', ctrl.publishEvent)
router.post('/events/:eventId/unpublish', ctrl.unpublishEvent)
router.get('/events/:eventId/ballot-preview', ctrl.getBallotPreview)

router.get('/events/:eventId/analytics', ctrl.getAnalytics)
router.get('/events/:eventId/analytics/timeline', ctrl.getVotingTimeline)

// ——— Persistent Create Draft (one per organizer + module) ———
router.get('/drafts', draftCtrl.getDraft('election'))
router.put('/drafts', draftCtrl.saveDraft('election'))
router.delete('/drafts', draftCtrl.deleteDraft('election'))
router.post('/drafts/publish', draftCtrl.publishDraft('election'))
router.post('/drafts/banner', uploadLimiter, uploadImage('banner'), draftCtrl.uploadBanner('election'))

export default router
