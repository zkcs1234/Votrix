import dotenv from 'dotenv'

dotenv.config()

export const isProduction = process.env.NODE_ENV === 'production'

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function getJwtSecret(name, envVar, fallback) {
  const value = process.env[envVar] || fallback
  if (isProduction && (!value || value.includes('dev-') || value.includes('change-me'))) {
    throw new Error(
      `JWT ${name} must be configured in production. Set ${envVar} environment variable with a strong secret.`
    )
  }
  return value
}

function parseOrigins() {
  const primary = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173')
    .trim()
    .replace(/\/$/, '')

  const extra = (process.env.CLIENT_URLS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)

  return [...new Set([primary, ...extra])]
}

const clientOrigins = parseOrigins()

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  /** Primary frontend origin (CORS + email links). FRONTEND_URL aliases CLIENT_URL. */
  clientUrl: clientOrigins[0],
  clientOrigins,

  jwt: {
    accessSecret: getJwtSecret('access', 'JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: getJwtSecret('refresh', 'JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    rememberRefreshExpiresIn: process.env.JWT_REMEMBER_REFRESH_EXPIRES_IN || '30d',
    accessCookieName: process.env.JWT_ACCESS_COOKIE_NAME || 'votrix_access',
    refreshCookieName: process.env.JWT_REFRESH_COOKIE_NAME || 'votrix_refresh',
  },

  cookie: {
    sameSite:
      process.env.COOKIE_SAME_SITE ||
      (process.env.NODE_ENV === 'production' ? 'none' : 'strict'),
  },

  csrf: {
    cookieName: process.env.CSRF_COOKIE_NAME || 'votrix_csrf',
    headerName: (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase(),
    secret: process.env.CSRF_SECRET || 'dev-csrf-secret-change-in-production-min-32-chars',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail:
      process.env.EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      'VOTRIX <onboarding@resend.dev>',
  },
}
