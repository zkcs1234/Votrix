import { asyncHandler } from '../utils/asyncHandler.js'
import { env } from '../config/env.js'
import { checkDatabaseConnection } from '../config/database.js'
import { getCloudinary } from '../config/cloudinary.js'
import { isEmailConfigured } from '../config/resend.js'

// A liveness/health probe must confirm the process is up and answer FAST — the
// platform health check (Render `healthCheckPath`) gates the whole deploy on it.
// So the DB check is bounded by a short timeout and can never hang or throw the
// endpoint: the process reports 200 even when the database is slow/unreachable,
// with the DB's real status still surfaced in the body for observability.
async function safeDatabaseStatus(timeoutMs = 3000) {
  try {
    return await Promise.race([
      checkDatabaseConnection(),
      new Promise((resolve) =>
        setTimeout(() => resolve({ connected: false, message: 'health check timed out' }), timeoutMs),
      ),
    ])
  } catch (err) {
    return { connected: false, message: err?.message || 'database check failed' }
  }
}

export const getHealth = asyncHandler(async (_req, res) => {
  const database = await safeDatabaseStatus()

  res.json({
    success: true,
    service: 'votrix-api',
    phase: 14,
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    integrations: {
      database,
      cloudinary: Boolean(getCloudinary()),
      resend: isEmailConfigured(),
    },
  })
})
