/**
 * Foundation — public surface.
 *
 * Foundation is a thin shared layer that removes cross-cutting
 * duplication. Modules may opt in incrementally; nothing in foundation
 * imports from a module.
 *
 *   - `db`                  → shared Supabase client + error wrapper
 *   - `errors`              → HTTP error factories
 *   - `pagination`          → parsePagination / buildRange / pagePayload
 *   - `filtering`           → applyTextSearch / applyIn / applyEq
 *   - `audit`               → recordAudit / listAuditTrail
 *   - `activity`            → recordEventActivity
 *   - `mapper`              → shared DB→DTO mappers
 *   - `repository`          → BaseRepository
 *   - `controller`          → ok / created / asyncHandler
 *
 * Module services still own their own domain logic. Foundation is
 * deliberately module-agnostic: it never reaches into another module's
 * data and never reads from another module's tables.
 */

export { db, wrap } from './db.js'
export * as errors from './errors.js'
export {
  parsePagination,
  buildRange,
  normalizeOrder,
  pagePayload,
} from './pagination.js'
export { applyTextSearch, applyIn, applyEq } from './filtering.js'
export { recordAudit, listAuditTrail } from './audit.js'
export { recordEventActivity } from './activity.js'
export {
  mapOrganization,
  mapEvent,
  mapNotification,
  mapAuditLog,
} from './mapper.js'
export { BaseRepository } from './repository.js'
export { ok, created, noContent, asyncHandler } from './controller.js'
