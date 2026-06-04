import { describe, test, expect } from 'vitest'

import { parsePagination, buildRange, normalizeOrder, pagePayload } from '../../src/foundation/pagination.js'
import { applyTextSearch, applyIn, applyEq } from '../../src/foundation/filtering.js'
import { badRequest, forbidden, notFound, conflict, serverError } from '../../src/foundation/errors.js'
import { mapOrganization, mapEvent, mapNotification, mapAuditLog } from '../../src/foundation/mapper.js'

describe('foundation/pagination', () => {
  test('parsePagination uses sensible defaults', () => {
    const p = parsePagination({})
    expect(p).toEqual({ page: 1, limit: 50, offset: 0 })
  })

  test('parsePagination caps the limit at maxLimit', () => {
    const p = parsePagination({ limit: '9999' }, { maxLimit: 100 })
    expect(p.limit).toBe(100)
  })

  test('parsePagination ignores non-numeric input gracefully', () => {
    const p = parsePagination({ page: 'abc', limit: 'xyz' })
    expect(p.page).toBe(1)
    expect(p.limit).toBe(50)
  })

  test('parsePagination enforces minimums', () => {
    const p = parsePagination({ page: '0', limit: '-5' })
    expect(p.page).toBe(1)
    expect(p.limit).toBe(1)
  })

  test('buildRange is inclusive on both ends', () => {
    expect(buildRange({ offset: 0, limit: 50 })).toEqual([0, 49])
    expect(buildRange({ offset: 100, limit: 25 })).toEqual([100, 124])
  })

  test('normalizeOrder defaults to created_at desc', () => {
    const ord = normalizeOrder()
    expect(ord).toEqual({ field: 'created_at', ascending: false })
  })

  test('normalizeOrder honours asc/desc suffix', () => {
    const asc = normalizeOrder('title:asc', { allowed: ['title'] })
    expect(asc).toEqual({ field: 'title', ascending: true })
    const desc = normalizeOrder('title:desc', { allowed: ['title'] })
    expect(desc).toEqual({ field: 'title', ascending: false })
  })

  test('normalizeOrder falls back to default when field not in allowed list', () => {
    const ord = normalizeOrder('password', { allowed: ['email'], defaultField: 'email' })
    expect(ord.field).toBe('email')
  })

  test('pagePayload returns rows + total + paging metadata', () => {
    const rows = [{ id: 1 }, { id: 2 }]
    const out = pagePayload(rows, 100, { page: 2, limit: 10, offset: 10 })
    expect(out).toMatchObject({
      rows,
      total: 100,
      page: 2,
      limit: 10,
      hasMore: true,
    })
  })
})

describe('foundation/filtering', () => {
  function fakeBuilder() {
    const calls = []
    return {
      calls,
      ilike(col, pattern) {
        calls.push(['ilike', col, pattern])
        return this
      },
      in(col, values) {
        calls.push(['in', col, values])
        return this
      },
      eq(col, value) {
        calls.push(['eq', col, value])
        return this
      },
    }
  }

  test('applyTextSearch is a no-op when query is empty', () => {
    const b = fakeBuilder()
    applyTextSearch(b, { column: 'title', query: '' })
    applyTextSearch(b, { column: 'title', query: null })
    expect(b.calls).toEqual([])
  })

  test('applyTextSearch escapes user-supplied wildcards', () => {
    const b = fakeBuilder()
    applyTextSearch(b, { column: 'title', query: '50%' })
    expect(b.calls).toEqual([['ilike', 'title', '*50\\%*']])
  })

  test('applyIn is a no-op for empty arrays', () => {
    const b = fakeBuilder()
    applyIn(b, 'id', [])
    applyIn(b, 'id', null)
    expect(b.calls).toEqual([])
  })

  test('applyIn adds the clause for non-empty arrays', () => {
    const b = fakeBuilder()
    applyIn(b, 'id', ['a', 'b'])
    expect(b.calls).toEqual([['in', 'id', ['a', 'b']]])
  })

  test('applyEq skips undefined and null', () => {
    const b = fakeBuilder()
    applyEq(b, 'role', undefined)
    applyEq(b, 'role', null)
    applyEq(b, 'role', 'admin')
    expect(b.calls).toEqual([['eq', 'role', 'admin']])
  })
})

describe('foundation/errors', () => {
  test('each factory returns an ApiError with the right status code', () => {
    expect(badRequest('x').statusCode).toBe(400)
    expect(forbidden('x').statusCode).toBe(403)
    expect(notFound('x').statusCode).toBe(404)
    expect(conflict('x').statusCode).toBe(409)
    expect(serverError('x').statusCode).toBe(500)
  })

  test('factories carry through the provided message and details', () => {
    const err = badRequest('Invalid', { field: 'email' })
    expect(err.message).toBe('Invalid')
    expect(err.details).toEqual({ field: 'email' })
  })
})

describe('foundation/mapper', () => {
  test('mapOrganization maps snake_case to camelCase and handles null', () => {
    expect(mapOrganization(null)).toBeNull()
    const out = mapOrganization({
      id: 'o1',
      organization_name: 'Acme',
      organization_type: 'election',
      logo: 'http://logo',
      status: 'active',
      organizer_id: 'u1',
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    })
    expect(out).toEqual({
      id: 'o1',
      organizationName: 'Acme',
      organizationType: 'election',
      logo: 'http://logo',
      status: 'active',
      organizerId: 'u1',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-02',
    })
  })

  test('mapEvent preserves nulls for optional fields', () => {
    const out = mapEvent({
      id: 'e1',
      organization_id: 'o1',
      title: 'Title',
      description: null,
      banner: null,
      start_date: null,
      end_date: null,
      status: 'draft',
      event_type: 'election',
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    })
    expect(out.description).toBeNull()
    expect(out.startDate).toBeNull()
  })

  test('mapNotification coerces is_read to boolean', () => {
    const out = mapNotification({ id: 'n1', user_id: 'u1', is_read: 1 })
    expect(out.isRead).toBe(true)
  })

  test('mapAuditLog flattens the users join', () => {
    const out = mapAuditLog({
      id: 'a1',
      user_id: 'u1',
      action: 'TEST',
      entity: 'events',
      entity_id: 'e1',
      details: { foo: 'bar' },
      created_at: '2024-01-01',
      users: { id: 'u1', email: 'a@b.c', role: 'admin' },
    })
    expect(out.actor).toEqual({ id: 'u1', email: 'a@b.c', role: 'admin' })
    expect(out.details).toEqual({ foo: 'bar' })
  })
})
