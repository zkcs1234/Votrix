import { env } from '../config/env.js'
import { getAuthCookieOptions } from '../config/cookieOptions.js'

export function setAuthCookies(res, { accessToken, refreshToken }) {
  const options = getAuthCookieOptions()
  const accessMaxAge = parseExpiryMs(env.jwt.accessExpiresIn)
  const refreshMaxAge = parseExpiryMs(env.jwt.refreshExpiresIn)

  res.cookie(env.jwt.accessCookieName, accessToken, {
    ...options,
    maxAge: accessMaxAge,
  })

  res.cookie(env.jwt.refreshCookieName, refreshToken, {
    ...options,
    maxAge: refreshMaxAge,
  })
}

export function clearAuthCookies(res) {
  const options = getAuthCookieOptions()
  res.clearCookie(env.jwt.accessCookieName, options)
  res.clearCookie(env.jwt.refreshCookieName, options)
}

function parseExpiryMs(value) {
  if (typeof value === 'number') return value * 1000

  const match = String(value).match(/^(\d+)([smhd])$/)
  if (!match) return 7 * 24 * 60 * 60 * 1000

  const amount = Number(match[1])
  const unit = match[2]

  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
  return amount * multipliers[unit]
}
