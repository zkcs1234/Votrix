import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn() }))
vi.mock('../../src/services/user-participant-type.service.js', () => ({
  hasParticipantTypeMembership: vi.fn(),
}))

import { db } from '../../src/foundation/db.js'
import { hasParticipantTypeMembership } from '../../src/services/user-participant-type.service.js'
import { PARTICIPANT_TYPES } from '../../src/utils/constants.js'
import { registerParticipant } from '../../src/services/participant.service.js'

function makeQuery(result) {
  const query = {}
  for (const method of ['select', 'eq', 'upsert']) query[method] = vi.fn(() => query)
  query.maybeSingle = vi.fn().mockResolvedValue({ data: result, error: null })
  query.single = vi.fn().mockResolvedValue({ data: result, error: null })
  return query
}

describe('event participant enrollment membership guard', () => {
  let eventQuery
  let accountQuery
  let enrollmentQuery
  let from

  beforeEach(() => {
    vi.clearAllMocks()
    eventQuery = makeQuery({ event_type: 'election' })
    accountQuery = makeQuery({ role: 'participant', account_status: 'active' })
    enrollmentQuery = makeQuery({ id: 'enrollment-1', participant_type: PARTICIPANT_TYPES.STUDENT })
    from = vi.fn((table) => table === 'events' ? eventQuery : table === 'users' ? accountQuery : enrollmentQuery)
    db.mockReturnValue({ from })
  })

  test('rejects an explicit participant type that conflicts with the event', async () => {
    await expect(registerParticipant('event-1', 'user-1', {
      participantType: PARTICIPANT_TYPES.COMPETITION_JUDGE,
    })).rejects.toThrow('Participant type does not match the event type')

    expect(hasParticipantTypeMembership).not.toHaveBeenCalled()
    expect(enrollmentQuery.upsert).not.toHaveBeenCalled()
  })

  test('rejects enrollment when the account lacks an active matching membership', async () => {
    hasParticipantTypeMembership.mockResolvedValue(false)

    await expect(registerParticipant('event-1', 'user-1'))
      .rejects.toThrow('Account is not eligible for this participant type')
    expect(enrollmentQuery.upsert).not.toHaveBeenCalled()
  })

  test('rejects suspended participant accounts before checking type membership', async () => {
    accountQuery.maybeSingle.mockResolvedValue({
      data: { role: 'participant', account_status: 'suspended' },
      error: null,
    })

    await expect(registerParticipant('event-1', 'user-1'))
      .rejects.toThrow('Participant account is not active')
    expect(hasParticipantTypeMembership).not.toHaveBeenCalled()
    expect(enrollmentQuery.upsert).not.toHaveBeenCalled()
  })

  test('enrolls an eligible student in an election as STUDENT', async () => {
    hasParticipantTypeMembership.mockResolvedValue(true)

    await expect(registerParticipant('event-1', 'user-1')).resolves.toEqual({
      id: 'enrollment-1',
      participant_type: PARTICIPANT_TYPES.STUDENT,
    })
    expect(hasParticipantTypeMembership).toHaveBeenCalledWith('user-1', PARTICIPANT_TYPES.STUDENT)
    expect(enrollmentQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      event_id: 'event-1',
      user_id: 'user-1',
      participant_type: PARTICIPANT_TYPES.STUDENT,
    }), expect.any(Object))
  })

  test('accepts the legacy ELECTION_VOTER value as an alias of STUDENT for an election', async () => {
    hasParticipantTypeMembership.mockResolvedValue(true)

    await registerParticipant('event-1', 'user-1', { participantType: PARTICIPANT_TYPES.ELECTION_VOTER })
    expect(enrollmentQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      participant_type: PARTICIPANT_TYPES.STUDENT,
    }), expect.any(Object))
  })

  test('enrolls a judge as COMPETITION_JUDGE after checking JUDGE eligibility', async () => {
    eventQuery = makeQuery({ event_type: 'competition_scoring' })
    from.mockImplementation((table) => table === 'events' ? eventQuery : table === 'users' ? accountQuery : enrollmentQuery)
    hasParticipantTypeMembership.mockResolvedValue(true)

    await registerParticipant('event-1', 'judge-1', { participantType: PARTICIPANT_TYPES.COMPETITION_JUDGE })
    expect(hasParticipantTypeMembership).toHaveBeenCalledWith('judge-1', PARTICIPANT_TYPES.JUDGE)
    expect(enrollmentQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      participant_type: PARTICIPANT_TYPES.COMPETITION_JUDGE,
    }), expect.any(Object))
  })
})
