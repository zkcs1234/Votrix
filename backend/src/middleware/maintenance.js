import { env } from '../config/env.js'
import { verifyAccessToken, verifyRefreshToken } from '../utils/jwt.js'
import { USER_ROLES } from '../utils/constants.js'
import { getPlatformSettings, maintenanceError } from '../services/platform-settings.service.js'

// While maintenance mode is on, only administrators can use the API. These paths
// stay open so the maintenance state itself can be shown and an administrator can
// still sign in (login rejects every non-admin after checking credentials).
const ALWAYS_ALLOWED = [
  /^\/health(\/|$)/,
  /^\/webhooks(\/|$)/,
  /^\/auth\/(csrf|login|logout)$/,
  /^\/public\/platform$/,
]

// Who is calling? The guard only decides whether to turn a request away for
// maintenance; it grants nothing — authenticate() still does the real checks.
// The refresh cookie is also consulted so an admin whose short-lived access token
// just expired is not locked out of /auth/refresh.
function roleFromCookies(req) {
  const access = req.cookies?.[env.jwt.accessCookieName]
  if (access) {
    try {
      return verifyAccessToken(access).role ?? null
    } catch {
      // expired or invalid: fall through to the refresh cookie
    }
  }
  const refresh = req.cookies?.[env.jwt.refreshCookieName]
  if (refresh) {
    try {
      return verifyRefreshToken(refresh).role ?? null
    } catch {
      return null
    }
  }
  return null
}

export async function maintenanceGuard(req, _res, next) {
  try {
    if (ALWAYS_ALLOWED.some((re) => re.test(req.path))) return next()

    const { maintenanceMode, platformName } = await getPlatformSettings()
    if (!maintenanceMode) return next()

    if (roleFromCookies(req) === USER_ROLES.ADMIN) return next()
    return next(maintenanceError(platformName))
  } catch (err) {
    return next(err)
  }
}
