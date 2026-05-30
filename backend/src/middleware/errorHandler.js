import { ApiError } from '../utils/ApiError.js'
import { env } from '../config/env.js'

export function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`))
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal server error'

  if (env.nodeEnv !== 'production') {
    console.error(err)
  }

  const body = {
    success: false,
    message,
  }

  if (err.details) {
    body.details = err.details
    if (err.details.code) {
      body.code = err.details.code
    }
  }

  if (env.nodeEnv !== 'production' && err.stack) {
    body.stack = err.stack
  }

  res.status(statusCode).json(body)
}
