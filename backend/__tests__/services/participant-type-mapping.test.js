import { describe, expect, test, vi } from 'vitest'

vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn() }))
vi.mock('../../src/services/user-participant-type.service.js', () => ({
  hasParticipantTypeMembership: vi.fn(),
}))

import {
  PARTICIPANT_TYPES,
  ELECTION_PARTICIPANT_TYPES,
  POLLING_PARTICIPANT_TYPES,
} from '../../src/utils/constants.js'
import { resolveEligibilityType, resolveParticipantType } from '../../src/services/participant.service.js'

describe('participant type mapping', () => {
  test('students enrolled by cohort invite are read back for polling and elections', () => {
    const enrolledType = resolveParticipantType('polling')
    expect(POLLING_PARTICIPANT_TYPES).toContain(enrolledType)
    expect(ELECTION_PARTICIPANT_TYPES).toContain(resolveParticipantType('election'))
  })

  test('legacy per-event types are still accepted by readers', () => {
    expect(POLLING_PARTICIPANT_TYPES).toContain(PARTICIPANT_TYPES.POLLING_RESPONDENT)
    expect(ELECTION_PARTICIPANT_TYPES).toContain(PARTICIPANT_TYPES.ELECTION_VOTER)
  })

  test('judges are checked against JUDGE eligibility but enrolled as COMPETITION_JUDGE', () => {
    expect(resolveParticipantType('pageant')).toBe(PARTICIPANT_TYPES.COMPETITION_JUDGE)
    expect(resolveEligibilityType(PARTICIPANT_TYPES.COMPETITION_JUDGE)).toBe(PARTICIPANT_TYPES.JUDGE)
    expect(resolveEligibilityType(PARTICIPANT_TYPES.STUDENT)).toBe(PARTICIPANT_TYPES.STUDENT)
  })
})
