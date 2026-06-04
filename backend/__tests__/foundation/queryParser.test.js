import { describe, test, expect, vi } from 'vitest'
import { paginationMiddleware } from '../../src/middleware/queryParser.js'

function run(query) {
  const req = { query }
  const next = vi.fn()
  paginationMiddleware({
    defaultLimit: 25,
    maxLimit: 100,
    allowedOrderFields: ['created_at', 'title'],
  })(req, {}, next)
  return { req, next }
}

describe('queryParser middleware', () => {
  test('parses defaults when no query string is present', () => {
    const { req, next } = run({})
    expect(req.pagination.page).toBe(1)
    expect(req.pagination.limit).toBe(25)
    expect(req.search).toBeNull()
    expect(req.order.field).toBe('created_at')
    expect(next).toHaveBeenCalledWith()
  })

  test('parses search from ?q=', () => {
    const { req } = run({ q: '  jane  ' })
    expect(req.search).toBe('jane')
  })

  test('parses search from ?search=', () => {
    const { req } = run({ search: 'doe' })
    expect(req.search).toBe('doe')
  })

  test('parses order with field:direction', () => {
    const { req } = run({ order: 'title:asc' })
    expect(req.order).toEqual({ field: 'title', ascending: true })
  })

  test('clamps limit to maxLimit', () => {
    const { req } = run({ limit: '500' })
    expect(req.pagination.limit).toBe(100)
  })
})
