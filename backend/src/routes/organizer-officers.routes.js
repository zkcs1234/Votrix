import { Router } from 'express'
import { requireOwnerOrganizer } from '../middleware/organizerContext.js'
import { officerActionLimiter } from '../middleware/rateLimiter.js'
import * as officersController from '../controllers/organizer-officers.controller.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'

// Managing officers is the owner organizer's job only. An officer (a student
// acting as the owner) must never be able to appoint or remove officers.
const router = Router()
router.use(requireOwnerOrganizer)
router.use(validateRouteUUIDParams)

router.get('/', officersController.listMyOfficers)
router.get('/candidates', officersController.listOfficerCandidates)
router.post('/', officerActionLimiter, officersController.assignMyOfficer)
router.patch('/:officerId', officerActionLimiter, officersController.updateMyOfficer)
router.post('/:officerId/deactivate', officerActionLimiter, officersController.deactivateMyOfficer)
router.post('/:officerId/activate', officerActionLimiter, officersController.activateMyOfficer)

export default router
