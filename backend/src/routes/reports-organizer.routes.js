import { Router } from 'express'
import * as ctrl from '../controllers/reports-organizer.controller.js'

const router = Router()

router.get('/overview', ctrl.getOverview)
router.get('/overview/export', ctrl.exportOverview)
router.get('/election/:eventId', ctrl.getElectionReport)
router.get('/election/:eventId/export', ctrl.exportElectionReport)
router.get('/pageant/:eventId', ctrl.getPageantReport)
router.get('/pageant/:eventId/export', ctrl.exportPageantReport)
router.get('/competition/:eventId', ctrl.getCompetitionReport)
router.get('/competition/:eventId/export', ctrl.exportCompetitionReport)
router.get('/polling/:eventId', ctrl.getPollingReport)
router.get('/polling/:eventId/export', ctrl.exportPollingReport)

export default router
