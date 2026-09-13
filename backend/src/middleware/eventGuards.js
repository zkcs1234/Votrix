import { ApiError } from '../utils/ApiError.js'
import { EVENT_STATUS } from '../utils/constants.js'
import { getEventById } from '../services/event.service.js'

// Terminal states an organizer can no longer edit. A completed or cancelled
// event is locked: the UI shows a read-only "View", and every mutation is
// rejected here so the lock holds even if a page or request is reached directly.
const READ_ONLY_EVENT_STATUSES = new Set([EVENT_STATUS.COMPLETED, EVENT_STATUS.CANCELLED])

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// Cloning a finished event into a fresh draft is a create, not an edit of the
// finished event, so the whole-event duplicate stays allowed. This matches ONLY
// `/events/:eventId/duplicate` — not sub-resource duplicates like
// `/events/:eventId/questions/:questionId/duplicate`, which ARE edits.
const EVENT_DUPLICATE_RE = /\/events\/[^/]+\/duplicate$/

// Paths that stay allowed even on a read-only event:
//  - the whole-event duplicate (above).
//  - /session/...: competition live-session controls manage the scoring
//    lifecycle (start/pause/complete/advance), not the event's setup or
//    details, and remain governed by their own service rules.
function isExemptPath(originalUrl) {
  const path = (originalUrl || '').split('?')[0]
  return EVENT_DUPLICATE_RE.test(path) || path.includes('/session/')
}

/**
 * Blocks mutating requests (POST/PATCH/PUT/DELETE) on an event whose status is
 * completed or cancelled. Mount on event-scoped organizer routers with a path
 * that carries :eventId, e.g. `router.use('/events/:eventId', requireEditableEvent)`.
 * Non-mutating methods, routes without an :eventId, and exempt paths pass through.
 */
export async function requireEditableEvent(req, _res, next) {
  try {
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) return next()

    const { eventId } = req.params
    if (!eventId) return next()
    if (isExemptPath(req.originalUrl)) return next()

    const event = await getEventById(eventId)
    if (event && READ_ONLY_EVENT_STATUSES.has(event.status)) {
      throw new ApiError(
        409,
        `This event is ${event.status} and can no longer be edited.`,
      )
    }

    next()
  } catch (err) {
    next(err)
  }
}
