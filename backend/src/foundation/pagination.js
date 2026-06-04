/**
 * Foundation: pagination & ordering helpers.
 *
 * `parsePagination` is the canonical replacement for the
 *   `parseInt(req.query.page, 10) || 1` / `parseInt(req.query.limit, 10) || 50`
 * pattern that was duplicated across controllers.
 *
 * `buildRange` produces a Supabase-compatible range tuple
 *   [from, to]
 * for the `.range(from, to)` method.
 *
 * `normalizeOrder` parses `?order=field` / `?order=field:desc` query strings
 * into a tuple that the Supabase builder understands.
 */

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50
const DEFAULT_PAGE = 1

export function parsePagination(query = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || DEFAULT_PAGE)
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit),
  )
  return {
    page,
    limit,
    offset: (page - 1) * limit,
  }
}

export function buildRange({ offset, limit }) {
  // Supabase .range is inclusive on both ends.
  return [offset, offset + limit - 1]
}

export function normalizeOrder(value, { allowed, defaultField = 'created_at', defaultDirection = 'desc' } = {}) {
  if (!value) return { field: defaultField, ascending: defaultDirection === 'asc' }
  const [rawField, rawDir] = String(value).split(':')
  const field = allowed ? allowed.includes(rawField) ? rawField : defaultField : rawField
  const ascending = (rawDir || '').toLowerCase() === 'asc'
  return { field, ascending }
}

/**
 * Build a `{ rows, total, page, limit, hasMore }` shape that the shared
 * `paginated()` controller helper can return as a uniform payload.
 */
export function pagePayload(rows, total, pagination) {
  return {
    rows,
    total: total ?? rows.length,
    page: pagination.page,
    limit: pagination.limit,
    hasMore: pagination.offset + rows.length < (total ?? rows.length),
  }
}
