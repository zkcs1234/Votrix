import { env, isProduction } from './env.js'

/**
 * Shared cookie options.
 *
 * Cross-origin setup (Vercel frontend → Render API) requires:
 *   SameSite=None  — tells browsers to send the cookie on cross-site requests
 *   Secure=true    — SameSite=None is ONLY honoured by browsers when Secure is
 *                    also set. Without it, mobile Safari / Chrome silently drop
 *                    the cookie even if the response arrives over HTTPS.
 *
 * Both flags must be present together. Setting one without the other is the
 * most common cause of auth cookies being accepted on desktop but silently
 * rejected on mobile browsers, which apply the spec more strictly.
 *
 * If COOKIE_SAME_SITE is explicitly set to 'none' in the environment (e.g. for
 * a staging server over HTTP), we still force Secure=true because SameSite=None
 * without Secure is rejected by all modern browsers regardless of protocol.
 */
export function getCookieOptions(overrides = {}) {
  const sameSite = isProduction ? 'none' : env.cookie.sameSite

  // SameSite=None mandates Secure=true per spec (RFC 6265bis).
  // Enforce this even if NODE_ENV is not production so staging deployments
  // over HTTPS (e.g. Render preview environments) work correctly on mobile.
  const secure = isProduction || sameSite === 'none'

  return {
    secure,
    sameSite,
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
