import { Router } from 'express'
import * as ctrl from '../controllers/reports-organizer.controller.js'

const router = Router()

router.get('/overview', ctrl.getOverview)
router.get('/election/:eventId', ctrl.getElectionReport)
router.get('/pageant/:eventId', ctrl.getPageantReport)
router.get('/polling/:eventId', ctrl.getPollingReport)

export default router
