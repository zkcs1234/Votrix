import { describe, expect, test } from 'vitest'
import { canVoterViewPollResults } from '../../src/utils/eventSchedule.js'

const now = new Date('2026-06-01T12:00:00Z')
const past = '2026-05-01T00:00:00Z'
const future = '2026-07-01T00:00:00Z'

describe('canVoterViewPollResults', () => {
  test('hidden never shows results', () => {
    expect(canVoterViewPollResults({ results_visibility: 'hidden', end_date: past, status: 'completed' }, now)).toBe(false)
  })

  test('real_time shows results while the poll is still open', () => {
    expect(canVoterViewPollResults({ results_visibility: 'real_time', end_date: future, status: 'active' }, now)).toBe(true)
  })

  test('public waits until the poll has concluded', () => {
    expect(canVoterViewPollResults({ results_visibility: 'public', end_date: future, status: 'active' }, now)).toBe(false)
    expect(canVoterViewPollResults({ results_visibility: 'public', end_date: past, status: 'active' }, now)).toBe(true)
    expect(canVoterViewPollResults({ resultsVisibility: 'public', pollExpiresAt: past, endDate: future }, now)).toBe(true)
    expect(canVoterViewPollResults({ results_visibility: 'public', end_date: future, status: 'completed' }, now)).toBe(true)
  })

  test('a missing or unknown setting is treated as hidden', () => {
    expect(canVoterViewPollResults({ end_date: past, status: 'completed' }, now)).toBe(false)
    expect(canVoterViewPollResults({ results_visibility: 'bogus', end_date: past }, now)).toBe(false)
  })
})
