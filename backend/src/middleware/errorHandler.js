import { ApiError } from '../utils/ApiError.js'
import { env } from '../config/env.js'

export function notFoundHandler(req, res, next) {
  // CWE-209: Use req.path (no query string) to avoid reflecting sensitive
  // query parameters (tokens, emails) back in the error response.
  next(new ApiError(404, `Route not found: ${req.method} ${req.path}`))
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

  // CWE-209: Never include stack traces in API responses regardless of
  // environment. Stack traces expose internal file paths, library versions,
  // and logic flow. They are logged server-side above.

  res.status(statusCode).json(body)
}
