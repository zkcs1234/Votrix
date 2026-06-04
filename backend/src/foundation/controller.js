/**
 * Foundation: response shape helpers.
 *
 * Every controller in the codebase returns roughly the same JSON envelope:
 *   { success: true, <resource>: <data> }
 * and on errors the errorHandler middleware emits:
 *   { success: false, message, ... }
 *
 * The helpers below formalize the success envelope so controllers stay
 * tiny and consistent. Existing controllers continue to work; new ones
 * are encouraged to use these helpers.
 */

export function ok(res, data) {
  if (data && typeof data === 'object' && 'rows' in data && 'total' in data) {
    return res.json({ success: true, ...data })
  }
  return res.json({ success: true, ...(data ?? {}) })
}

export function created(res, data) {
  return res.status(201).json({ success: true, ...(data ?? {}) })
}

export function noContent(res) {
  return res.status(204).end()
}

/**
 * Wrap an async route handler and forward rejections to `next()` while
 * also covering synchronous throws. Re-exports `asyncHandler` for
 * callers that prefer to import controllers and handlers from one place.
 */
export { asyncHandler } from '../utils/asyncHandler.js'
