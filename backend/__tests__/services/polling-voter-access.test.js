import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn() }))

import { db } from '../../src/foundation/db.js'
import { assertVoterCanRespond } from '../../src/services/polling.service.js'

function makeQuery(result) {
  const query = {}
  for (const method of ['select', 'eq', 'in', 'neq']) query[method] = vi.fn(() => query)
  query.maybeSingle = vi.fn().mockResolvedValue({ data: result, error: null })
  return query
}

describe('assertVoterCanRespond', () => {
  let query
  beforeEach(() => {
    vi.clearAllMocks()
    query = makeQuery({ id: 'participant-1', event_id: 'poll-1', has_responded: false, events: { status: 'active' } })
    db.mockReturnValue({ from: vi.fn(() => query) })
  })

  test('embeds events so the archived filter is valid ("events is not an embedded resource")', async () => {
    await assertVoterCanRespond('poll-1', 'student-1')
    const columns = query.select.mock.calls[0][0]
    expect(columns).toContain('events!inner')
    expect(query.neq).toHaveBeenCalledWith('events.status', 'archived')
  })

  test('accepts a STUDENT enrollment and the legacy respondent type', async () => {
    await assertVoterCanRespond('poll-1', 'student-1')
    expect(query.in).toHaveBeenCalledWith('participant_type', expect.arrayContaining(['STUDENT', 'POLLING_RESPONDENT']))
  })

  test('rejects a student who is not enrolled', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(assertVoterCanRespond('poll-1', 'student-1')).rejects.toMatchObject({ statusCode: 403 })
  })
})
