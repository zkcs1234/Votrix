/**
 * Foundation: audit log helper.
 *
 * Wraps the `audit_logs` table with a single entry point so callers don't
 * have to remember the column name mapping or the safe behaviour on
 * missing users.
 *
 * Audit logs are write-only and best-effort. The helper swallows errors
 * (logging to stderr) so a transient failure in the audit pipeline cannot
 * break a user-facing write. This is consistent with the existing
 * `createAuditLog` in `admin.service.js`.
 */

import { db, wrap } from './db.js'
import { DB_TABLES } from '../utils/constants.js'

/**
 * Record an audit log entry.
 *
 * @param {object} args
 * @param {string|null} args.userId   — actor id (null = system action)
 * @param {string}      args.action   — dotted action name, e.g. 'election.event.create'
 * @param {string=}     args.entity   — entity name, e.g. 'events', 'users'
 * @param {string=}     args.entityId — entity row id
 * @param {object=}     args.details  — JSON-serializable additional context
 * @returns {Promise<object|null>}    — inserted row or null on failure
 */
export async function recordAudit({ userId, action, entity, entityId, details } = {}) {
  if (!action) {
    // eslint-disable-next-line no-console
    console.warn('[foundation/audit] recordAudit called without action — skipping')
    return null
  }

  try {
    const client = db()
    const { data, error } = await client
      .from(DB_TABLES.AUDIT_LOGS)
      .insert({
        user_id: userId ?? null,
        action,
        entity: entity ?? null,
        entity_id: entityId ?? null,
        details: details ?? null,
      })
      .select('*')
      .single()
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[foundation/audit] failed to write audit log:', error.message)
      return null
    }
    return data
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[foundation/audit] failed to write audit log:', err?.message)
    return null
  }
}

/**
 * Fetch the recent audit trail, optionally filtered by entity.
 */
export async function listAuditTrail({ entity, entityId, limit = 100 } = {}) {
  const client = db()
  let query = client
    .from(DB_TABLES.AUDIT_LOGS)
    .select(
      `id, action, entity, entity_id, details, created_at,
       user_id, users ( email, role )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (entity) query = query.eq('entity', entity)
  if (entityId) query = query.eq('entity_id', entityId)

  return wrap(query, { context: 'listAuditTrail' })
}
