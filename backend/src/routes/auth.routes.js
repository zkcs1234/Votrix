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
router.post('/login', authLimiter, authController.login)
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword)
router.post('/reset-password', passwordResetLimiter, authController.resetPassword)
router.post('/refresh', refreshLimiter, authController.refresh)
router.post('/logout', authController.logout)

router.get('/me', authenticate, authController.getMe)
router.post('/change-password', authenticate, strictLimiter, authController.changePassword)
router.post('/skip-password-change', authenticate, strictLimiter, authController.skipPasswordChange)

export default router
