import { describe, expect, it } from 'vitest'
import { accountTypeLabel, membershipRows } from './accountProfile'

describe('accountTypeLabel', () => {
  it('names the participant type', () => {
    expect(accountTypeLabel({ participantTypes: ['STUDENT'] })).toBe('Student')
    expect(accountTypeLabel({ participantTypes: ['JUDGE'] })).toBe('Judge')
  })
  it('is null when the type is unknown or not loaded', () => {
    expect(accountTypeLabel({})).toBeNull()
    expect(accountTypeLabel({ participantTypes: [] })).toBeNull()
    expect(accountTypeLabel({ participantTypes: ['ELECTION_VOTER'] })).toBeNull()
  })
})

describe('membershipRows', () => {
  it('lists the organization and position of a student officer', () => {
    expect(membershipRows({ officership: { organizationName: 'SSG', position: 'President', organizerName: 'Jo' } }))
      .toEqual([{ label: 'Member of', value: 'SSG' }, { label: 'Position', value: 'President' }])
  })
  it('is empty for someone who is not an officer', () => {
    expect(membershipRows({ officership: null })).toEqual([])
    expect(membershipRows({})).toEqual([])
  })
})
