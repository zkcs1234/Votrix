import { Router } from 'express'
import { authLimiter } from '../middleware/rateLimiter.js'
import { authenticate } from '../middleware/auth.js'
import * as authController from '../controllers/auth.controller.js'

const router = Router()

router.get('/csrf', authController.getCsrfToken)
router.post('/admin/login', authLimiter, authController.adminLogin)
router.post('/organizer/login', authLimiter, authController.organizerLogin)
router.post('/voter/login', authLimiter, authController.voterLogin)
router.post('/forgot-password', authLimiter, authController.forgotPassword)
router.post('/reset-password', authLimiter, authController.resetPassword)
router.post('/refresh', authController.refresh)
router.post('/logout', authController.logout)

router.get('/me', authenticate, authController.getMe)
router.post('/change-password', authenticate, authController.changePassword)

export default router
