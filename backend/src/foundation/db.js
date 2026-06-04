/**
 * Foundation: shared database access.
 *
 * Replaces the `function getClient()` boilerplate that was duplicated
 * across every service file in the codebase. The shared helper:
 *   - returns the Supabase client from the existing config
 *   - throws a consistent 503 if the client is not configured
 *   - exposes a `wrap()` helper that turns Supabase errors into ApiError
 *     instances, so the "if (error) throw new ApiError(500, error.message)"
 *     pattern stops being copy-pasted.
 *
 * Module services are still free to call the underlying client directly for
 * module-specific queries. This file only owns the cross-cutting helper.
 */

import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'

let warnedUnavailable = false

export function db() {
  const client = getSupabase()
  if (!client) {
    if (!warnedUnavailable) {
      warnedUnavailable = true
      // eslint-disable-next-line no-console
      console.warn('[foundation/db] Supabase client unavailable — DB calls will throw 503')
    }
    throw new ApiError(503, 'Database is not configured')
  }
  return client
}

/**
 * Wrap a Supabase `{ data, error }` result.
 * - If `error` is present, throws an `ApiError` carrying the Supabase message.
 *   For a `PGRST116` (no rows for `.single()`) the caller can pass
 *   `{ notFoundMessage }` to convert it into a 404.
 * - Otherwise returns `data` (after applying `transform` if provided).
 */
export function wrap(result, { notFoundMessage, transform, context } = {}) {
  const { data, error } = result ?? {}
  if (error) {
    // .single() / .maybeSingle() with no rows surfaces as PGRST116 in PostgREST.
    if (error.code === 'PGRST116' && notFoundMessage) {
      throw new ApiError(404, notFoundMessage)
    }
    throw new ApiError(500, `${context ? `${context}: ` : ''}${error.message}`)
  }
  return transform ? transform(data) : data
}
