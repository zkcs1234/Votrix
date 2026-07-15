import { Router } from 'express'
import { uploadSingle, uploadImage } from '../middleware/upload.js'
import { uploadLimiter, csvImportLimiter, emailLimiter } from '../middleware/rateLimiter.js'
import * as ctrl from '../controllers/election-organizer.controller.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'

const router = Router()
router.use(validateRouteUUIDParams)

router.get('/dashboard', ctrl.getDashboard)
router.post('/organization/logo', uploadLimiter, uploadImage('logo'), ctrl.uploadOrganizationLogo)
router.get('/events', ctrl.listEvents)
router.post('/events', ctrl.createEvent)
router.get('/events/:eventId', ctrl.getEvent)
router.patch('/events/:eventId', ctrl.updateEvent)
router.patch('/events/:eventId/voting', ctrl.setVoting)
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

// Registration and Invitation separated
router.post('/events/:eventId/voters/register', emailLimiter, ctrl.registerVoter)
router.post('/events/:eventId/voters/register-existing', emailLimiter, ctrl.registerExistingVoter)
router.post('/events/:eventId/voters/:voterId/send-invitation', emailLimiter, ctrl.sendInvitation)
router.post('/events/:eventId/voters/send-all', emailLimiter, ctrl.sendAllInvitations)
router.post('/events/:eventId/voters/import-preview', csvImportLimiter, uploadSingle('file'), ctrl.previewImportCsv)
router.post('/events/:eventId/voters/import-register', csvImportLimiter, ctrl.registerImportCsv)

router.get('/events/:eventId/analytics', ctrl.getAnalytics)

export default router
