import { asyncHandler } from '../utils/asyncHandler.js'
import { env } from '../config/env.js'
import { checkDatabaseConnection } from '../config/database.js'
import { getCloudinary } from '../config/cloudinary.js'
import { getResend } from '../config/resend.js'

export const getHealth = asyncHandler(async (_req, res) => {
  const database = await checkDatabaseConnection()

  res.json({
    success: true,
    service: 'votrix-api',
    phase: 14,
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    integrations: {
      database,
      cloudinary: Boolean(getCloudinary()),
      resend: Boolean(getResend()),
    },
  })
})
