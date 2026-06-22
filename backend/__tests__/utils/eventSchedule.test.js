import { describe, test, expect } from 'vitest'
import {
  isWithinEventSchedule,
  isElectionVotingOpen,
  isPollOpen,
  isCompetitionScoringOpen,
  canVoterViewElectionResults,
} from '../../src/utils/eventSchedule.js'

describe('eventSchedule', () => {
  const now = new Date('2025-06-15T12:00:00.000Z')

  test('isWithinEventSchedule allows null dates', () => {
    expect(isWithinEventSchedule({}, now)).toBe(true)
  })

  test('isWithinEventSchedule blocks before start', () => {
    expect(
      isWithinEventSchedule({ start_date: '2025-06-16T00:00:00.000Z' }, now),
    ).toBe(false)
  })

  test('isWithinEventSchedule blocks after end', () => {
    expect(
      isWithinEventSchedule({ end_date: '2025-06-14T00:00:00.000Z' }, now),
    ).toBe(false)
  })

  test('isElectionVotingOpen requires enabled flag and schedule', () => {
    const event = {
      voting_enabled: true,
      start_date: '2025-06-01T00:00:00.000Z',
      end_date: '2025-06-30T00:00:00.000Z',
    }
    expect(isElectionVotingOpen(event, now)).toBe(true)
    expect(isElectionVotingOpen({ ...event, voting_enabled: false }, now)).toBe(false)
    expect(isElectionVotingOpen({ ...event, end_date: '2025-06-10T00:00:00.000Z' }, now)).toBe(
      false,
    )
  })

  test('isPollOpen respects polling_enabled, expiry, and schedule', () => {
    const event = {
      polling_enabled: true,
      start_date: '2025-06-01T00:00:00.000Z',
      end_date: '2025-06-30T00:00:00.000Z',
      poll_expires_at: '2025-06-20T00:00:00.000Z',
    }
    expect(isPollOpen(event, now)).toBe(true)
    expect(isPollOpen({ ...event, poll_expires_at: '2025-06-10T00:00:00.000Z' }, now)).toBe(
      false,
    )
  })

  test('canVoterViewElectionResults follows visibility rules', () => {
    const openEvent = {
      voting_enabled: true,
      results_visibility: 'public',
      end_date: '2025-06-30T00:00:00.000Z',
    }
    const closedEvent = { ...openEvent, voting_enabled: false }

    expect(canVoterViewElectionResults({ results_visibility: 'hidden' }, now)).toBe(false)
    expect(canVoterViewElectionResults({ results_visibility: 'real_time' }, now)).toBe(true)
    expect(canVoterViewElectionResults(openEvent, now)).toBe(false)
    expect(canVoterViewElectionResults(closedEvent, now)).toBe(true)
  })

  test('isCompetitionScoringOpen requires enabled flag and schedule', () => {
    const event = {
      scoring_enabled: true,
      start_date: '2025-06-01T00:00:00.000Z',
      end_date: '2025-06-30T00:00:00.000Z',
    }
    expect(isCompetitionScoringOpen(event, now)).toBe(true)
    expect(isCompetitionScoringOpen({ ...event, scoring_enabled: false }, now)).toBe(false)
  })
})
