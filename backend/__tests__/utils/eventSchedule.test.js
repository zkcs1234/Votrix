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

  test('isElectionVotingOpen: schedule is authoritative — a future start_date holds voting closed even when manually enabled/active', () => {
    // Organizer enabled voting early (status 'active') but the scheduled start
    // is still in the future → voting must stay CLOSED until start_date arrives.
    const armedButNotStarted = {
      voting_enabled: true,
      status: 'active',
      start_date: '2025-06-20T00:00:00.000Z', // after `now` (2025-06-15)
      end_date: '2025-06-30T00:00:00.000Z',
    }
    expect(isElectionVotingOpen(armedButNotStarted, now)).toBe(false)

    // Once the start_date has passed, the manual toggle opens voting.
    const startedAndActive = { ...armedButNotStarted, start_date: '2025-06-10T00:00:00.000Z' }
    expect(isElectionVotingOpen(startedAndActive, now)).toBe(true)

    // No start_date set → manual toggle retains immediate control.
    const noSchedule = { voting_enabled: true, status: 'active' }
    expect(isElectionVotingOpen(noSchedule, now)).toBe(true)

    // A passed end_date still closes voting regardless of status.
    const ended = { ...startedAndActive, end_date: '2025-06-12T00:00:00.000Z' }
    expect(isElectionVotingOpen(ended, now)).toBe(false)
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

  test('isPollOpen: schedule is authoritative — a future start_date holds the poll closed even when manually enabled/active', () => {
    // Organizer enabled polling early (setPollOpen sets status 'active') but the
    // scheduled start is still in the future → the poll must stay CLOSED until
    // start_date arrives. Regression guard for the "poll opens before start_date"
    // bug (POLLING_MODULE_ANALYSIS §3.2).
    const armedButNotStarted = {
      polling_enabled: true,
      status: 'active',
      start_date: '2025-06-20T00:00:00.000Z', // after `now` (2025-06-15)
      end_date: '2025-06-30T00:00:00.000Z',
    }
    expect(isPollOpen(armedButNotStarted, now)).toBe(false)

    // Once the start_date has passed, the manual toggle opens the poll.
    const startedAndActive = { ...armedButNotStarted, start_date: '2025-06-10T00:00:00.000Z' }
    expect(isPollOpen(startedAndActive, now)).toBe(true)

    // No start_date set → manual toggle retains immediate control.
    expect(isPollOpen({ polling_enabled: true, status: 'active' }, now)).toBe(true)

    // A passed end_date or poll_expires_at still closes the poll regardless of status.
    expect(isPollOpen({ ...startedAndActive, end_date: '2025-06-12T00:00:00.000Z' }, now)).toBe(false)
    expect(
      isPollOpen({ ...startedAndActive, poll_expires_at: '2025-06-12T00:00:00.000Z' }, now),
    ).toBe(false)
  })

  test('isCompetitionScoringOpen: schedule is authoritative — a future start_date holds scoring closed even when active', () => {
    const armedButNotStarted = {
      scoring_enabled: true,
      status: 'active',
      start_date: '2025-06-20T00:00:00.000Z', // after `now`
      end_date: '2025-06-30T00:00:00.000Z',
    }
    expect(isCompetitionScoringOpen(armedButNotStarted, now)).toBe(false)
    expect(
      isCompetitionScoringOpen({ ...armedButNotStarted, start_date: '2025-06-10T00:00:00.000Z' }, now),
    ).toBe(true)
  })

  test('canVoterViewElectionResults follows visibility rules', () => {
    // 'public' results reveal only once the election has genuinely concluded —
    // not while it is running, and not while merely paused.
    const runningEvent = {
      voting_enabled: true,
      results_visibility: 'public',
      end_date: '2025-06-30T00:00:00.000Z', // after `now`
    }
    const pausedEvent = { ...runningEvent, voting_enabled: false } // paused, end still in future

    expect(canVoterViewElectionResults({ results_visibility: 'hidden' }, now)).toBe(false)
    expect(canVoterViewElectionResults({ results_visibility: 'real_time' }, now)).toBe(true)
    expect(canVoterViewElectionResults(runningEvent, now)).toBe(false)
    // Pausing voting must NOT expose public results (previously leaked here).
    expect(canVoterViewElectionResults(pausedEvent, now)).toBe(false)

    // Concluded by schedule → public results visible.
    const endedEvent = { ...runningEvent, end_date: '2025-06-10T00:00:00.000Z' }
    expect(canVoterViewElectionResults(endedEvent, now)).toBe(true)
    // Concluded by organizer action → public results visible even before end_date.
    const finalizedEvent = { ...runningEvent, status: 'completed', election_status: 'finalized' }
    expect(canVoterViewElectionResults(finalizedEvent, now)).toBe(true)
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
