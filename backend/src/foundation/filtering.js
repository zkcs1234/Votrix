/**
 * Foundation: filtering & search helpers.
 *
 * These helpers are intentionally Supabase-shaped (they accept a builder
 * and return it after chaining). They never reach into another module's
 * domain — they only operate on fields the caller specifies.
 */

/**
 * Apply a simple `ilike %q%` text search on a single column. The caller
 * decides which column to search (e.g. events.title, users.email).
 */
export function applyTextSearch(builder, { column, query, mode = 'ilike' } = {}) {
  const q = (query ?? '').toString().trim()
  if (!q || !column) return builder
  // Supabase PostgREST treats `*` as a wildcard inside `ilike` patterns.
  const pattern = `*${q.replace(/[%_]/g, (m) => `\\${m}`)}*`
  return builder[mode](column, pattern)
}

/**
 * Apply an `in (values)` filter when values is a non-empty array. The
 * filter is a no-op for empty/nullish inputs so callers don't have to
 * pre-check before chaining.
 */
export function applyIn(builder, column, values) {
  if (!Array.isArray(values) || values.length === 0) return builder
  return builder.in(column, values)
}

/**
 * Apply an `eq` filter only when the value is present (not undefined and
 * not null). Empty strings are still passed through.
 */
export function applyEq(builder, column, value) {
  if (value === undefined || value === null) return builder
  return builder.eq(column, value)
}
