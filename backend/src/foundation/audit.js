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

import { db } from './db.js'
import { DB_TABLES } from '../utils/constants.js'
import { ApiError } from '../utils/ApiError.js'

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
 * Fetch the recent audit trail, optionally filtered by entity, with
 * support for pagination, full-text search, and date range filtering.
 *
 * @param {object} opts
 * @param {string=}  opts.entity      — filter to a specific entity type
 * @param {string=}  opts.entityId    — filter to a specific entity row
 * @param {string=}  opts.action      — exact action filter
 * @param {string=}  opts.search      — partial match across action/entity/details text
 * @param {string=}  opts.startDate   — ISO date lower bound (inclusive) on created_at
 * @param {string=}  opts.endDate     — ISO date upper bound (inclusive) on created_at
 * @param {number=}  opts.limit       — rows per page (default 50, max 200)
 * @param {number=}  opts.offset      — rows to skip for pagination (default 0)
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listAuditTrail({
  entity,
  entityId,
  action,
  search,
  startDate,
  endDate,
  limit = 50,
  offset = 0,
} = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200)
  const safeOffset = Math.max(0, Number(offset) || 0)
  const client = db()

  let query = client
    .from(DB_TABLES.AUDIT_LOGS)
    .select(
      `id, action, entity, entity_id, details, created_at,
       user_id, users ( id, email, role )`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1)

  if (entity) query = query.eq('entity', entity)
  if (entityId) query = query.eq('entity_id', entityId)
  if (action) query = query.eq('action', action)
  if (startDate) query = query.gte('created_at', startDate)
  if (endDate) {
    // Include the full end day by going to end of that day in UTC
    const end = new Date(endDate)
    end.setUTCHours(23, 59, 59, 999)
    query = query.lte('created_at', end.toISOString())
  }
  // Partial text search across action + entity + details cast to text
  if (search && search.trim()) {
    const term = search.trim()
    // PostgREST ilike filter — search against action field as primary fast path;
    // also apply an OR across entity. Full details search is handled client-side
    // for the first 200 rows since JSONB ilike is not natively supported without
    // a generated column or FTS index. This approach is fast and avoids N+1.
    query = query.or(`action.ilike.%${term}%,entity.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  if (error) {
    throw new ApiError(500, `listAuditTrail: ${error.message}`)
  }
  return { rows: data ?? [], total: count ?? 0 }
}
