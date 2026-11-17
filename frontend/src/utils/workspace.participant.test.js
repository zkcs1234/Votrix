import { describe, expect, it } from 'vitest'
import {
  getParticipantTypes,
  participantChipLabel,
  participantKind,
  sameParticipantContext,
} from './workspace'

const officership = { organizerId: 'o1', organizationName: 'Computing Society', position: 'President' }

describe('participant account kind', () => {
  it('reads the account types the server sent', () => {
    expect(getParticipantTypes({ participantTypes: ['STUDENT'] })).toEqual(['STUDENT'])
    expect(getParticipantTypes({})).toEqual([])
    expect(getParticipantTypes({ participantTypes: 'STUDENT' })).toEqual([])
  })

  it.each([
    [['STUDENT'], 'student'],
    [['JUDGE'], 'judge'],
    [[], 'participant'],
    [undefined, 'participant'],
    // Not a valid state (an account is one or the other), but it must not guess.
    [['STUDENT', 'JUDGE'], 'participant'],
  ])('%j -> %s', (types, expected) => {
    expect(participantKind({ participantTypes: types })).toBe(expected)
  })
})

describe('participantChipLabel', () => {
  const user = (extra) => ({ role: 'participant', participantTypes: ['STUDENT'], ...extra })

  it('labels students and judges', () => {
    expect(participantChipLabel(user())).toBe('Student')
    expect(participantChipLabel(user({ participantTypes: ['JUDGE'] }))).toBe('Judge')
    expect(participantChipLabel(user({ participantTypes: [] }))).toBe('Participant')
  })

  it('marks an officer in the student view and in the workspace', () => {
    expect(participantChipLabel(user({ officership }))).toBe('Student · Officer')
    expect(participantChipLabel(user({ officership }), true)).toBe('Officer')
  })

  it('leaves other roles to the caller', () => {
    expect(participantChipLabel({ role: 'admin' })).toBeNull()
    expect(participantChipLabel({ role: 'organizer' })).toBeNull()
    expect(participantChipLabel(null)).toBeNull()
  })
})

describe('sameParticipantContext', () => {
  it('is equal only when both officership and types match', () => {
    const a = { participantTypes: ['STUDENT'], officership }
    expect(sameParticipantContext(a, { participantTypes: ['STUDENT'], officership: { ...officership } })).toBe(true)
    expect(sameParticipantContext(a, { participantTypes: ['STUDENT'], officership: null })).toBe(false)
    expect(sameParticipantContext(a, { participantTypes: ['JUDGE'], officership })).toBe(false)
    expect(sameParticipantContext({}, {})).toBe(true)
  })
})
