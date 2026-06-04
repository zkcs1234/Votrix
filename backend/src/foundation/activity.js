/**
 * Foundation: event-level activity tracking.
 *
 * The `audit_logs` table stores per-action history. This helper offers a
 * smaller, event-scoped log that any module can use to record activity
 * against an event (e.g. "voter invited", "scoring opened", "results
 * published") without reaching into another module's service.
 *
 * Activity entries are written through the same `audit_logs` table to
 * keep a single source of truth for time-series logs. The
 * `entity = 'events'` + `entity_id = <eventId>` + `action = <module>.<verb>`
 * triplet is the convention every module agrees on.
 */

import { recordAudit } from './audit.js'

/**
 * Record activity against a specific event.
 *
 * @param {object} args
 * @param {string}      args.eventId
 * @param {string}      args.action   — module-prefixed verb, e.g. 'polling.question.create'
 * @param {string|null} args.userId   — actor id
 * @param {object=}     args.details  — JSON-serializable context
 * @param {string=}     args.module   — module name used as the `entity` field
 *                                     (defaults to the value of `meta.module`
 *                                     or 'events' for generic activity)
 */
export async function recordEventActivity({ eventId, action, userId, details, module: mod } = {}) {
  if (!eventId || !action) return null
  return recordAudit({
    userId: userId ?? null,
    action,
    entity: 'events',
    entityId: eventId,
    details: {
      ...(details ?? {}),
      ...(mod ? { module: mod } : {}),
    },
  })
}
