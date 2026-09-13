import { db, wrap } from '../foundation/db.js'
import { DB_TABLES } from '../utils/constants.js'
import { ApiError } from '../utils/ApiError.js'

function extractClientMeta(req) {
  const ip =
    req?.headers?.['x-forwarded-for']?.split(',')?.[0]?.trim() ||
    req?.headers?.['x-real-ip'] ||
    req?.ip ||
    null
  const userAgent = req?.headers?.['user-agent'] || null
  return { ip, userAgent }
}

export async function recordSession({
  userId,
  tokenVersion = 0,
  ip = null,
  userAgent = null,
} = {}) {
  if (!userId) {
    throw new ApiError(400, 'userId is required to record a session')
  }
  const result = await db()
    .from(DB_TABLES.USER_SESSIONS)
    .insert({
      user_id: userId,
      token_version: tokenVersion,
      ip_address: ip,
      user_agent: userAgent,
    })
    .select('id, user_id, token_version, ip_address, user_agent, last_activity_at, created_at')
    .single()
  return wrap(result, { context: 'session.recordSession' })
}

export async function touchSession(sessionId) {
  if (!sessionId) return null
  const result = await db()
    .from(DB_TABLES.USER_SESSIONS)
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (result?.error) {
    // Touching activity is best-effort; do not break the request.
    return null
  }
  return true
}

/**
 * Report whether a bound session row still exists.
 *
 * Returns `false` ONLY when we can positively confirm the row is gone — i.e.
 * the session was revoked. On any infrastructure error we fail OPEN (return
 * `true`) so a transient database issue on this table cannot lock every user
 * out; the token_version check remains the hard security gate in that case.
 */
export async function isSessionActive(sessionId) {
  if (!sessionId) return true
  try {
    const { data, error } = await db()
      .from(DB_TABLES.USER_SESSIONS)
      .select('id')
      .eq('id', sessionId)
      .maybeSingle()
    if (error) return true
    return Boolean(data)
  } catch {
    return true
  }
}

export async function listAdminSessions({ limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 500)
  const result = await db()
    .from(DB_TABLES.USER_SESSIONS)
    .select(
      `id, user_id, token_version, ip_address, user_agent, last_activity_at, created_at,
       users ( id, email, role )`,
    )
    .order('last_activity_at', { ascending: false })
    .limit(safeLimit)
  return wrap(result, { context: 'session.listAdminSessions' })
}

export async function listSessionsForUser(userId, { limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200)
  const result = await db()
    .from(DB_TABLES.USER_SESSIONS)
    .select('id, user_id, token_version, ip_address, user_agent, last_activity_at, created_at')
    .eq('user_id', userId)
    .order('last_activity_at', { ascending: false })
    .limit(safeLimit)
  return wrap(result, { context: 'session.listSessionsForUser' })
}

export async function revokeSession(sessionId) {
  if (!sessionId) {
    throw new ApiError(400, 'sessionId is required')
  }
  const result = await db()
    .from(DB_TABLES.USER_SESSIONS)
    .delete()
    .eq('id', sessionId)
    .select('id, user_id')
    .single()
  return wrap(result, { notFoundMessage: 'Session not found', context: 'session.revokeSession' })
}

export async function revokeAllSessionsForUser(userId, { exceptSessionId = null } = {}) {
  if (!userId) {
    throw new ApiError(400, 'userId is required')
  }
  let query = db()
    .from(DB_TABLES.USER_SESSIONS)
    .delete()
    .eq('user_id', userId)
  if (exceptSessionId) {
    query = query.neq('id', exceptSessionId)
  }
  const { data, error } = await query.select('id')
  if (error) {
    throw new ApiError(500, `session.revokeAll: ${error.message}`)
  }
  return { revokedCount: data?.length ?? 0 }
}

export const sessionMeta = {
  extractClientMeta,
}
