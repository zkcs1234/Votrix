import { describe, test, expect } from 'vitest'
import { ApiError } from '../../src/utils/ApiError.js'
import {
  validateBallot,
  validatePosition,
  validateCandidate,
  validateVotingToggle,
} from '../../src/validators/election.validator.js'

describe('election.validator', () => {
  describe('validateBallot', () => {
    test('returns normalized selections', () => {
      const result = validateBallot({ selections: { 'pos-1': ['c-1', 'c-2'] } })
      expect(result.selections).toEqual({ 'pos-1': ['c-1', 'c-2'] })
    })

    test('preserves the voting nonce (Phase 3 replay protection)', () => {
      const result = validateBallot({
        selections: { 'pos-1': ['c-1'] },
        votingNonce: 'nonce-abc',
      })
      expect(result.votingNonce).toBe('nonce-abc')
    })

    test('defaults votingNonce to null when absent (legacy clients)', () => {
      const result = validateBallot({ selections: { 'pos-1': ['c-1'] } })
      expect(result.votingNonce).toBeNull()
    })

    test('throws when selections missing', () => {
      expect(() => validateBallot({})).toThrow(ApiError)
    })

    test('throws when a position value is not an array', () => {
      expect(() => validateBallot({ selections: { 'pos-1': 'c-1' } })).toThrow(ApiError)
    })
  })

  describe('validatePosition', () => {
    test('rejects missing name', () => {
      expect(() => validatePosition({})).toThrow(ApiError)
    })

    test('rejects maxVote below 1', () => {
      expect(() => validatePosition({ name: 'Pres', maxVote: 0 })).toThrow(ApiError)
    })

    test('defaults numberOfWinners and maxVote to 1', () => {
      const result = validatePosition({ name: 'President' })
      expect(result.maxVote).toBe(1)
      expect(result.numberOfWinners).toBe(1)
    })
  })

  describe('validateCandidate', () => {
    test('accepts either party or partylist and persists to partylist', () => {
      expect(validateCandidate({ name: 'A', party: 'Blue' }).partylist).toBe('Blue')
      expect(validateCandidate({ name: 'B', partylist: 'Red' }).partylist).toBe('Red')
    })

    test('rejects missing name', () => {
      expect(() => validateCandidate({})).toThrow(ApiError)
    })
  })

  describe('validateVotingToggle', () => {
    test('requires a boolean', () => {
      expect(validateVotingToggle({ votingEnabled: true })).toBe(true)
      expect(() => validateVotingToggle({ votingEnabled: 'yes' })).toThrow(ApiError)
    })
  })
})
