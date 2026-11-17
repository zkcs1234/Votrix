import { Router } from 'express'
import { publicApiLimiter } from '../middleware/rateLimiter.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { getPlatformSettings } from '../services/platform-settings.service.js'

// Public, unauthenticated: the app reads this before anyone signs in, to show the
// platform name and, during maintenance, the maintenance screen. It exposes only
// those two facts (never the organizer limit or any other setting).
const router = Router()

router.get(
  '/',
  publicApiLimiter,
  asyncHandler(async (_req, res) => {
    const { platformName, maintenanceMode } = await getPlatformSettings()
    res.set('Cache-Control', 'no-store')
    res.json({ success: true, platformName, maintenanceMode })
  }),
)

export default router
