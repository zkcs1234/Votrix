import { Router } from 'express'
import { publicApiLimiter, organizerApplyLimiter } from '../middleware/rateLimiter.js'
import { uploadCertificates } from '../middleware/upload.js'
import * as applyController from '../controllers/organizer-apply.controller.js'

// Public organizer application (unauthenticated). POST is covered by the global
// CSRF middleware (it is not on the exempt list), so clients must fetch
// /auth/csrf first, same as every other state-changing public call.
const router = Router()

router.get('/:token', publicApiLimiter, applyController.getApplyForm)
router.post('/:token', organizerApplyLimiter, uploadCertificates('certificates'), applyController.submitApply)

export default router
