import { Router } from 'express'
import healthRoutes from './health.routes.js'
import authRoutes from './auth.routes.js'
import adminRoutes from './admin.routes.js'
import organizerRoutes from './organizer.routes.js'
import voterRoutes from './voter.routes.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'VOTRIX API',
    version: '1.0.0',
    phase: 12,
  })
})

router.use('/health', healthRoutes)
router.use('/auth', authRoutes)
router.use('/admin', adminRoutes)
router.use('/organizer', organizerRoutes)
router.use('/voter', voterRoutes)

export default router
