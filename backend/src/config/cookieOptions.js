import { env, isProduction } from './env.js'

/**
 * Shared cookie options. Production defaults to SameSite=None for cross-origin
 * frontends (e.g. Vercel) calling the API (e.g. Render). Requires HTTPS.
 */
export function getCookieOptions(overrides = {}) {
  return {
    secure: isProduction,
    // Force SameSite=None in production to support cross-site cookies (Vercel -> API)
    sameSite: isProduction ? 'none' : env.cookie.sameSite,
    path: '/',
    ...overrides,
  }
}

export function getAuthCookieOptions() {
  return getCookieOptions({ httpOnly: true })
}

export function getCsrfCookieOptions() {
  return getCookieOptions({ httpOnly: false })
}
