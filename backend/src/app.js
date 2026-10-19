import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { configureCloudinary } from './config/cloudinary.js'
import { getSupabase } from './config/database.js'
import { globalLimiter } from './middleware/rateLimiter.js'
import { csrfProtection } from './middleware/csrf.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'
import { assertProductionSecurity } from './config/security.js'
import { isTrustedOrigin } from './config/trusted-origins.js'
import apiRoutes from './routes/index.js'
import {competitionRatePolicy} from './middleware/competition-rate-policy.js'

export function createApp() {
  assertProductionSecurity()

  const app = express()

  const isAllowedOrigin = origin => isTrustedOrigin(origin, env.clientOrigins)

  app.set('trust proxy', 1)

  // Helpful during CORS issues: echo current allowed origins to logs.
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api/auth/csrf')) {
      console.log('[CORS]', {
        origin: req.headers.origin,
        allowed: req.headers.origin ? isAllowedOrigin(req.headers.origin) : true,
        clientOrigins: env.clientOrigins,
      })
    }
    next()
  })

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  )

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true)
          return
        }
        if (isAllowedOrigin(origin)) {
          callback(null, true)
          return
        }
        callback(null, false)
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'X-CSRF-Token'],
    }),
  )

  // CORS controls response visibility, not execution. Deny browser mutations
  // from untrusted origins even if they carry a previously issued CSRF token.
  app.use((req, res, next) => {
    if (req.headers.origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isAllowedOrigin(req.headers.origin)) {
      res.status(403).json({ success: false, message: 'Request origin is not trusted' })
      return
    }
    next()
  })

  app.use(cookieParser())
  app.use(competitionRatePolicy)
  app.use(globalLimiter)
  app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '1mb' }))
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use('/api', csrfProtection)

  configureCloudinary()
  getSupabase()

  app.use('/api', apiRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
