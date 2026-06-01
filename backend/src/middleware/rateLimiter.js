import rateLimit from 'express-rate-limit'

/**
 * VOTRIX Rate Limiting & Abuse Prevention
 * ========================================
 *
 * Defaults to MemoryStore. To enable Redis in production:
 *   1. npm install rate-limit-redis ioredis
 *   2. Import { RedisStore } from 'rate-limit-redis'
 *   3. Create a redis client and pass store: new RedisStore({ sendCommand: (...) })
 *
 * All limits are configurable via environment variables.
 */

const ONE_MINUTE = 60 * 1000
const FIFTEEN_MINUTES = 15 * ONE_MINUTE
const ONE_HOUR = 60 * ONE_MINUTE

function parseEnvInt(name, fallback) {
  const val = process.env[name]
  if (!val) return fallback
  const parsed = parseInt(val, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function getClientIp(req) {
  // req.ip is set correctly when app.set('trust proxy', 1) is configured
  return req.ip || req.connection?.remoteAddress || 'unknown'
}

/**
 * Build a composite rate-limit key.
 *
 * @param {Object} opts
 * @param {boolean} opts.user  - Include authenticated user id
 * @param {boolean} opts.ip    - Include client IP
 * @param {boolean} opts.event - Include req.params.eventId
 * @param {string}  opts.suffix - Optional static suffix
 */
function createKey({ user = false, ip = true, event = false, suffix = '' } = {}) {
  return (req) => {
    const parts = []
    if (user && req.user?.id) {
      parts.push(`u:${req.user.id}`)
    } else if (ip) {
      parts.push(`ip:${getClientIp(req)}`)
    }
    if (event && req.params?.eventId) {
      parts.push(`ev:${req.params.eventId}`)
    }
    if (suffix) {
      parts.push(suffix)
    }
    return parts.join(':') || 'global'
  }
}

function stdMessage(message) {
  return { success: false, message }
}

function createLimiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  })
}

// ───────────────────────────────────────────────
// GLOBAL SAFETY NET
// ───────────────────────────────────────────────

export const globalLimiter = createLimiter({
  windowMs: parseEnvInt('RATE_LIMIT_GLOBAL_WINDOW_MS', FIFTEEN_MINUTES),
  max: (req) =>
    req.user
      ? parseEnvInt('RATE_LIMIT_GLOBAL_USER_MAX', 500)
      : parseEnvInt('RATE_LIMIT_GLOBAL_IP_MAX', 100),
  keyGenerator: createKey({ user: true, ip: true }),
  skip: (req) => {
    // Never throttle health probes
    const path = req.path || req.originalUrl
    return path === '/api/health' || path === '/health'
  },
  message: stdMessage('Too many requests. Please slow down.'),
})

// ───────────────────────────────────────────────
// AUTHENTICATION & IDENTITY
// ───────────────────────────────────────────────

export const csrfLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: parseEnvInt('RATE_LIMIT_CSRF_MAX', 60),
  keyGenerator: createKey({ ip: true, suffix: 'csrf' }),
  message: stdMessage('Too many CSRF token requests. Please try again later.'),
})

export const authLimiter = createLimiter({
  windowMs: parseEnvInt('RATE_LIMIT_AUTH_WINDOW_MS', FIFTEEN_MINUTES),
  max: parseEnvInt('RATE_LIMIT_AUTH_IP_MAX', 10),
  keyGenerator: createKey({ ip: true, suffix: 'auth' }),
  // Failed AND successful attempts both count to prevent token harvesting
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  message: stdMessage('Too many login attempts. Please try again later.'),
})

export const passwordResetLimiter = createLimiter({
  windowMs: parseEnvInt('RATE_LIMIT_PASSWORD_RESET_WINDOW_MS', ONE_HOUR),
  max: parseEnvInt('RATE_LIMIT_PASSWORD_RESET_IP_MAX', 3),
  keyGenerator: createKey({ ip: true, suffix: 'pwd-reset' }),
  message: stdMessage('Too many password reset requests. Please try again later.'),
})

export const refreshLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: parseEnvInt('RATE_LIMIT_REFRESH_MAX', 30),
  keyGenerator: createKey({ ip: true, suffix: 'refresh' }),
  message: stdMessage('Too many token refresh attempts.'),
})

export const strictLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: parseEnvInt('RATE_LIMIT_STRICT_MAX', 5),
  keyGenerator: createKey({ user: true, ip: true, suffix: 'strict' }),
  message: stdMessage('Too many sensitive requests. Please try again later.'),
})

// ───────────────────────────────────────────────
// VOTE / SUBMISSION / SCORE PROTECTION
// ───────────────────────────────────────────────
// Multi-layer: per-IP-per-event + per-user-per-event.
// Apply both middlewares to the route for maximum protection.

function makeEventLimiters({ name, ipMax, userMax, windowMs, message }) {
  return {
    ip: createLimiter({
      windowMs,
      max: ipMax,
      keyGenerator: createKey({ ip: true, event: true, suffix: `${name}:ip` }),
      message: stdMessage(message),
    }),
    user: createLimiter({
      windowMs,
      max: userMax,
      keyGenerator: createKey({ user: true, event: true, suffix: `${name}:user` }),
      message: stdMessage(message),
    }),
  }
}

/** Election ballot submission */
export const voteLimiters = makeEventLimiters({
  name: 'vote',
  ipMax: parseEnvInt('RATE_LIMIT_VOTE_IP_MAX', 10),
  userMax: parseEnvInt('RATE_LIMIT_VOTE_USER_MAX', 3),
  windowMs: parseEnvInt('RATE_LIMIT_VOTE_WINDOW_MS', ONE_MINUTE),
  message: 'Too many votes submitted. Please wait before voting again.',
})

/** Poll response submission */
export const pollLimiters = makeEventLimiters({
  name: 'poll',
  ipMax: parseEnvInt('RATE_LIMIT_POLL_IP_MAX', 15),
  userMax: parseEnvInt('RATE_LIMIT_POLL_USER_MAX', 3),
  windowMs: parseEnvInt('RATE_LIMIT_POLL_WINDOW_MS', ONE_MINUTE),
  message: 'Too many poll submissions. Please wait before submitting again.',
})

/** Pageant score submission */
export const scoreLimiters = makeEventLimiters({
  name: 'score',
  ipMax: parseEnvInt('RATE_LIMIT_SCORE_IP_MAX', 10),
  userMax: parseEnvInt('RATE_LIMIT_SCORE_USER_MAX', 3),
  windowMs: parseEnvInt('RATE_LIMIT_SCORE_WINDOW_MS', ONE_MINUTE),
  message: 'Too many score submissions. Please wait before scoring again.',
})

/** Legacy generic submit limiter (kept for backward compatibility) */
export const submitLimiter = createLimiter({
  windowMs: ONE_MINUTE,
  max: parseEnvInt('RATE_LIMIT_SUBMIT_MAX', 15),
  keyGenerator: createKey({ user: true, ip: true, suffix: 'submit' }),
  message: stdMessage('Too many submissions. Please wait and try again.'),
})

// ───────────────────────────────────────────────
// EMAIL & NOTIFICATION ANTI-SPAM
// ───────────────────────────────────────────────

export const emailLimiter = createLimiter({
  windowMs: parseEnvInt('RATE_LIMIT_EMAIL_WINDOW_MS', ONE_HOUR),
  max: parseEnvInt('RATE_LIMIT_EMAIL_USER_MAX', 20),
  keyGenerator: createKey({ user: true, ip: true, suffix: 'email' }),
  message: stdMessage('Too many emails sent. Please try again later.'),
})

// ───────────────────────────────────────────────
// BULK IMPORT & FILE UPLOAD
// ───────────────────────────────────────────────

export const csvImportLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: parseEnvInt('RATE_LIMIT_CSV_USER_MAX', 5),
  keyGenerator: createKey({ user: true, ip: true, suffix: 'csv' }),
  message: stdMessage('Too many CSV imports. Please try again later.'),
})

export const uploadLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: parseEnvInt('RATE_LIMIT_UPLOAD_USER_MAX', 20),
  keyGenerator: createKey({ user: true, ip: true, suffix: 'upload' }),
  message: stdMessage('Too many file uploads. Please try again later.'),
})

// ───────────────────────────────────────────────
// ADMIN & ORGANIZATION PROTECTION
// ───────────────────────────────────────────────

export const adminActionLimiter = createLimiter({
  windowMs: ONE_HOUR,
  max: parseEnvInt('RATE_LIMIT_ADMIN_ACTION_MAX', 20),
  keyGenerator: createKey({ user: true, ip: true, suffix: 'admin' }),
  message: stdMessage('Too many admin actions. Please try again later.'),
})

// ───────────────────────────────────────────────
// PUBLIC / UNAUTHENTICATED ENDPOINTS
// ───────────────────────────────────────────────

export const publicApiLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: parseEnvInt('RATE_LIMIT_PUBLIC_API_IP_MAX', 60),
  keyGenerator: createKey({ ip: true, suffix: 'public' }),
  message: stdMessage('Too many public API requests. Please slow down.'),
})

// ───────────────────────────────────────────────
// TEST UTILITIES
// ───────────────────────────────────────────────

/**
 * Reset all in-memory rate-limit counters.
 * Useful in integration tests to avoid cross-test pollution.
 */
export function resetRateLimitStores() {
  // express-rate-limit MemoryStore instances keep state on the limiter object.
  // There is no public bulk-reset API; restarting the process is the safest
  // approach. In test suites, create a fresh app per test file (beforeAll).
}
