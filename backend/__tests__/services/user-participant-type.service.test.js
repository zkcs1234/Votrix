import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn() }))

import { db } from '../../src/foundation/db.js'
import { PARTICIPANT_TYPES } from '../../src/utils/constants.js'
import {
  addParticipantTypeMembership,
  hasParticipantTypeMembership,
  setParticipantTypeMembership,
} from '../../src/services/user-participant-type.service.js'

function makeQuery(result) {
  const query = {}
  for (const method of ['upsert', 'update', 'select', 'eq']) {
    query[method] = vi.fn(() => query)
  }
  query.single = vi.fn().mockResolvedValue({ data: result, error: null })
  query.maybeSingle = vi.fn().mockResolvedValue({ data: result, error: null })
  return query
}

describe('user participant type memberships', () => {
  beforeEach(() => vi.clearAllMocks())

  test('adds a type idempotently and reactivates a previous membership', async () => {
    const membership = { user_id: 'user-1', participant_type: PARTICIPANT_TYPES.ELECTION_VOTER, is_active: true }
    const query = makeQuery(membership)
    const from = vi.fn().mockReturnValue(query)
    db.mockReturnValue({ from })

    await expect(addParticipantTypeMembership('user-1', PARTICIPANT_TYPES.ELECTION_VOTER, 'admin-1'))
      .resolves.toEqual(membership)

    expect(from).toHaveBeenCalledWith('user_participant_types')
    expect(query.upsert).toHaveBeenCalledWith({
      user_id: 'user-1',
      participant_type: PARTICIPANT_TYPES.ELECTION_VOTER,
      is_active: true,
      created_by: 'admin-1',
    }, { onConflict: 'user_id,participant_type' })
  })

  test('rejects unknown participant types before querying the database', async () => {
    await expect(addParticipantTypeMembership('user-1', 'STUDENT'))
      .rejects.toThrow('Invalid participant type')
    expect(db).not.toHaveBeenCalled()
  })

  test('checks only active membership rows', async () => {
    const query = makeQuery({ user_id: 'user-1' })
    db.mockReturnValue({ from: vi.fn().mockReturnValue(query) })

    await expect(hasParticipantTypeMembership('user-1', PARTICIPANT_TYPES.POLLING_RESPONDENT)).resolves.toBe(true)
    expect(query.eq).toHaveBeenCalledWith('is_active', true)
  })

  test('deactivates one membership without deleting its row', async () => {
    const membership = { user_id: 'user-1', participant_type: PARTICIPANT_TYPES.COMPETITION_JUDGE, is_active: false }
    const query = makeQuery(membership)
    db.mockReturnValue({ from: vi.fn().mockReturnValue(query) })

    await expect(setParticipantTypeMembership('user-1', PARTICIPANT_TYPES.COMPETITION_JUDGE, false))
      .resolves.toEqual(membership)
    expect(query.update).toHaveBeenCalledWith({ is_active: false })
    expect(query.eq).toHaveBeenCalledWith('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
  })
})