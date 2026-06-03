import { Router } from 'express'
import { authenticate, authorize, requireActiveAccount, requirePasswordChanged } from '../middleware/auth.js'
import { USER_ROLES } from '../utils/constants.js'
import * as notificationsController from '../controllers/notifications.controller.js'

const router = Router()

router.use(
  authenticate,
  authorize(USER_ROLES.ADMIN, USER_ROLES.ORGANIZER, USER_ROLES.VOTER),
  requireActiveAccount,
  requirePasswordChanged,
)

router.get('/', notificationsController.getNotifications)
router.get('/unread-count', notificationsController.getUnreadCount)
router.patch('/:notificationId/read', notificationsController.markRead)
router.patch('/read-all', notificationsController.markAllRead)

export default router
