import { describe, expect, it } from 'vitest'
import { assertEventUpdateAllowed } from '../../src/utils/eventLifecycle.js'

describe('assertEventUpdateAllowed', () => {
  it('allows core field updates for draft and scheduled events', () => {
    expect(() => assertEventUpdateAllowed({ status: 'draft' }, { title: 'Updated title' })).not.toThrow()
    expect(() => assertEventUpdateAllowed({ status: 'scheduled' }, { title: 'Updated title' })).not.toThrow()
  })

  it('blocks core field updates for active, completed, cancelled, and archived events', () => {
    for (const status of ['active', 'completed', 'cancelled', 'archived']) {
      expect(() => assertEventUpdateAllowed({ status }, { title: 'Updated title' })).toThrow(
        /cannot be edited/i,
      )
    }
  })

  it('allows status and visibility updates that are not core fields', () => {
    expect(() => assertEventUpdateAllowed({ status: 'active' }, { status: 'completed' })).not.toThrow()
    expect(() => assertEventUpdateAllowed({ status: 'active' }, { resultsVisibility: 'public' })).not.toThrow()
  })
})
