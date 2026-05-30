import { Router } from 'express'
import { authenticate, authorize, requirePasswordChanged } from '../middleware/auth.js'
import { USER_ROLES } from '../utils/constants.js'
import * as adminController from '../controllers/admin.controller.js'

const router = Router()

router.use(authenticate, authorize(USER_ROLES.ADMIN), requirePasswordChanged)

router.get('/overview', adminController.getAdminOverview)
router.get('/dashboard', adminController.getDashboard)
router.get('/analytics', adminController.getAnalytics)
router.post('/organizers', adminController.createOrganizerAccount)

export default router
