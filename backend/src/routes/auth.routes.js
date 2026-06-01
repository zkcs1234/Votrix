import { Router } from 'express'
import {
  authLimiter,
  csrfLimiter,
  passwordResetLimiter,
  refreshLimiter,
  strictLimiter,
} from '../middleware/rateLimiter.js'
import { authenticate } from '../middleware/auth.js'
import * as authController from '../controllers/auth.controller.js'

const router = Router()

router.get('/csrf', csrfLimiter, authController.getCsrfToken)
router.post('/admin/login', authLimiter, authController.adminLogin)
router.post('/organizer/login', authLimiter, authController.organizerLogin)
router.post('/voter/login', authLimiter, authController.voterLogin)
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword)
router.post('/reset-password', passwordResetLimiter, authController.resetPassword)
router.post('/refresh', refreshLimiter, authController.refresh)
router.post('/logout', authController.logout)

router.get('/me', authenticate, authController.getMe)
router.post('/change-password', authenticate, strictLimiter, authController.changePassword)

export default router
