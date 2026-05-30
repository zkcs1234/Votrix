import crypto from 'crypto'
import { env } from '../config/env.js'
import { getCsrfCookieOptions } from '../config/cookieOptions.js'

export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function setCsrfCookie(res, token) {
  res.cookie(env.csrf.cookieName, token, {
    ...getCsrfCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

export function clearCsrfCookie(res) {
  res.clearCookie(env.csrf.cookieName, getCsrfCookieOptions())
}

export function issueCsrfToken(res) {
  const token = generateCsrfToken()
  setCsrfCookie(res, token)
  return token
}
