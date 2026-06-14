import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { configureCloudinary } from './config/cloudinary.js'
import { getResend } from './config/resend.js'
import { getSupabase } from './config/database.js'
import { globalLimiter } from './middleware/rateLimiter.js'
import { csrfProtection } from './middleware/csrf.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'
import { assertProductionSecurity } from './config/security.js'
import apiRoutes from './routes/index.js'

export function createApp() {
  assertProductionSecurity()

  const app = express()

  function isAllowedOrigin(origin) {
    const normalizedOrigin = origin.replace(/\/$/, '')

    if (env.clientOrigins.includes(normalizedOrigin)) {
      return true
    }

    const allowVercelPreviews = (process.env.ALLOW_VERCEL_PREVIEWS || 'true').toLowerCase() !== 'false'
    if (allowVercelPreviews) {
      try {
        const url = new URL(normalizedOrigin)
        return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')
      } catch {
        return false
      }
    }

    return false
  }

  app.set('trust proxy', 1)

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
      methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
      allowedHeaders: ['Content-Type','Authorization','x-csrf-token'],
    }),

  )
  app.use(globalLimiter)
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())
  app.use('/api', csrfProtection)

  configureCloudinary()
  getResend()
  getSupabase()

  app.use('/api', apiRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
