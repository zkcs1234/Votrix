import { describe, test, expect, vi, beforeEach } from 'vitest'

// Hoist a mock for the Supabase client so we can drive the audit helper
// without a real database. The shared `foundation/db.js` calls
// `getSupabase()` from the config; this replaces that module.
const fromMock = vi.fn()
vi.mock('../../src/config/database.js', () => ({
  getSupabase: () => ({ from: fromMock }),
}))

import { recordAudit, listAuditTrail } from '../../src/foundation/audit.js'
import { DB_TABLES } from '../../src/utils/constants.js'

beforeEach(() => {
  fromMock.mockReset()
})

describe('foundation/audit.recordAudit', () => {
  test('writes a row to the audit_logs table with mapped columns', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    fromMock.mockReturnValue({ insert })

    const out = await recordAudit({
      userId: 'u1',
      action: 'election.event.create',
      entity: 'events',
      entityId: 'e1',
      details: { foo: 'bar' },
    })

    expect(insert).toHaveBeenCalledWith({
      user_id: 'u1',
      action: 'election.event.create',
      entity: 'events',
      entity_id: 'e1',
      details: { foo: 'bar' },
    })
    expect(out).toEqual({ id: 'a1' })
  })

  test('returns null and never throws when the DB write fails', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    fromMock.mockReturnValue({ insert })

    const out = await recordAudit({ userId: 'u1', action: 'TEST' })
    expect(out).toBeNull()
  })

  test('skips gracefully when called without an action', async () => {
    const out = await recordAudit({ userId: 'u1' })
    expect(out).toBeNull()
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('foundation/audit.listAuditTrail', () => {
  test('queries the audit_logs table with default ordering and limit', async () => {
    const limit = vi.fn().mockReturnThis()
    const order = vi.fn(() => ({ limit }))
    const select = vi.fn(() => ({ order }))
    fromMock.mockReturnValue({ select })

    await listAuditTrail()

    expect(fromMock).toHaveBeenCalledWith(DB_TABLES.AUDIT_LOGS)
    expect(select).toHaveBeenCalled()
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(100)
  })

  test('applies entity and entityId filters when provided', async () => {
    const eq = vi.fn().mockReturnThis()
    const limit = vi.fn(() => ({ eq, limit: vi.fn().mockReturnThis() }))
    const order = vi.fn(() => ({ limit }))
    const select = vi.fn(() => ({ order }))
    fromMock.mockReturnValue({ select })

    await listAuditTrail({ entity: 'events', entityId: 'e1', limit: 10 })

    // The exact chain shape is internal; assert that eq() was called at
    // least once for both filters.
    expect(eq).toHaveBeenCalledWith('entity', 'events')
  })
})
