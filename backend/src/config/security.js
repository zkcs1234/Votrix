import { env, isProduction } from './env.js'

const INSECURE_SECRETS = new Set([
  'dev-access-secret',
  'dev-refresh-secret-change-me',
  'change-this-to-a-long-random-access-secret',
  'change-this-to-a-long-random-refresh-secret',
])

function missing(label, value) {
  return !value || String(value).trim() === ''
}

export function assertProductionSecurity() {
  if (!isProduction) return

  if (INSECURE_SECRETS.has(env.jwt.accessSecret) || INSECURE_SECRETS.has(env.jwt.refreshSecret)) {
    throw new Error(
      'Production requires strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (or JWT_SECRET + JWT_REFRESH_SECRET).',
    )
  }

  if (!env.csrf.secret || env.csrf.secret.length < 32) {
    throw new Error('Production requires CSRF_SECRET (min 32 characters).')
  }

  if (!env.clientUrl.startsWith('https://')) {
    throw new Error('Production requires FRONTEND_URL (or CLIENT_URL) to use https://')
  }

  if (env.cookie.sameSite !== 'none') {
    console.warn(
      '[votrix] COOKIE_SAME_SITE is not "none" — cross-origin cookies (Vercel + Render) may fail.',
    )
  }

  const required = [
    ['SUPABASE_URL', env.supabase.url],
    ['SUPABASE_SERVICE_ROLE_KEY', env.supabase.serviceRoleKey],
    ['RESEND_API_KEY', env.resend.apiKey],
    ['EMAIL_FROM or RESEND_FROM_EMAIL', env.resend.fromEmail],
    ['CLOUDINARY_CLOUD_NAME', env.cloudinary.cloudName],
    ['CLOUDINARY_API_KEY', env.cloudinary.apiKey],
    ['CLOUDINARY_API_SECRET', env.cloudinary.apiSecret],
  ]

  const gaps = required.filter(([, value]) => missing('', value)).map(([name]) => name)

  if (gaps.length > 0) {
    throw new Error(
      `Production missing required environment variables: ${gaps.join(', ')}. See DEPLOYMENT.md.`,
    )
  }
}
