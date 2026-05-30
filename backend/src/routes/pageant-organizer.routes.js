import { Router } from 'express'
import { uploadSingle, uploadImage } from '../middleware/upload.js'
import { uploadLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/pageant-organizer.controller.js'

const router = Router()

router.get('/dashboard', ctrl.getDashboard)
router.post('/organization/logo', uploadLimiter, uploadImage('logo'), ctrl.uploadOrganizationLogo)
router.get('/events', ctrl.listEvents)
router.post('/events', ctrl.createEvent)
router.get('/events/:eventId', ctrl.getEvent)
router.patch('/events/:eventId', ctrl.updateEvent)
router.patch('/events/:eventId/scoring', ctrl.setScoring)
router.post('/events/:eventId/banner', uploadLimiter, uploadImage('banner'), ctrl.uploadBanner)

router.get('/events/:eventId/contestants', ctrl.listContestants)
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

router.get('/events/:eventId/judges', ctrl.listJudges)
router.post('/events/:eventId/judges/invite', ctrl.inviteJudge)
router.post('/events/:eventId/judges/import', uploadSingle('file'), ctrl.importJudgesCsv)

router.get('/events/:eventId/rankings', ctrl.getRankings)
router.get('/events/:eventId/analytics', ctrl.getAnalytics)

export default router
