/**
 * Query parser middleware.
 *
 * Attaches a normalized `req.pagination`, `req.search`, and `req.order`
 * derived from query string parameters, so controllers don't have to
 * re-implement the parsing on every route.
 *
 *   GET /api/foo?page=2&limit=25&q=jane&order=created_at:asc
 *       → req.pagination = { page: 2, limit: 25, offset: 25 }
 *       → req.search      = "jane"
 *       → req.order       = { field: "created_at", ascending: true }
 *
 * The middleware is read-only — it does not mutate the parsed query
 * object. Routes that need different defaults can read `req.query` and
 * bypass these helpers.
 */

import {
  parsePagination,
  normalizeOrder,
} from '../foundation/pagination.js'

const SEARCH_KEYS = ['q', 'search', 'query']

export function paginationMiddleware({
  defaultLimit,
  maxLimit,
  allowedOrderFields,
  defaultOrderField = 'created_at',
  defaultOrderDirection = 'desc',
  searchKeys = SEARCH_KEYS,
} = {}) {
  return (req, _res, next) => {
    req.pagination = parsePagination(req.query, { defaultLimit, maxLimit })

    const search = searchKeys.map((k) => req.query[k]).find((v) => typeof v === 'string' && v.trim().length)
    req.search = search ? search.trim() : null

    req.order = normalizeOrder(req.query.order, {
      allowed: allowedOrderFields,
      defaultField: defaultOrderField,
      defaultDirection: defaultOrderDirection,
    })

    next()
  }
}
