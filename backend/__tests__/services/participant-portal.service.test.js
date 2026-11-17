import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeSupabase } from '../helpers/fake-supabase.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))
vi.mock('../../src/services/voter.service.js', () => ({ loadClassifiedEvents: vi.fn() }))
vi.mock('../../src/services/competition-workflow.service.js', () => ({ judgePublishedResults: vi.fn() }))
vi.mock('../../src/services/competition-native-results.service.js', () => ({ publicResults: vi.fn() }))

import { loadClassifiedEvents } from '../../src/services/voter.service.js'
import { judgePublishedResults } from '../../src/services/competition-workflow.service.js'
import { publicResults } from '../../src/services/competition-native-results.service.js'
import {
  getParticipantEvents,
  getParticipantHistory,
  getParticipantResults,
  historyOutcome,
  isEventClosed,
} from '../../src/services/participant-portal.service.js'

const ME = 'user-me'
const OTHER = 'user-other'
const NOW = new Date('2026-11-16T12:00:00Z')

const election = (id, extra = {}) => ({
  id, title: `Election ${id}`, eventType: 'election', organizationName: 'Student Government',
  bucket: 'assigned', hasVoted: false, submittedSections: 0, totalSections: 1,
  eventStatus: 'completed', startDate: '2026-03-10T00:00:00Z', endDate: '2026-03-12T00:00:00Z',
  resultsVisibility: 'public', canViewResults: true, ...extra,
})
const poll = (id, extra = {}) => ({
  id, title: `Poll ${id}`, eventType: 'polling', organizationName: 'Library', bucket: 'completed',
  hasResponded: true, pollAnonymous: false, eventStatus: 'completed',
  startDate: '2026-02-01T00:00:00Z', endDate: '2026-02-07T00:00:00Z', ...extra,
})
const competition = (id, extra = {}) => ({
  id, title: `Competition ${id}`, eventType: 'competition_scoring', organizationName: 'Arts Guild',
  bucket: 'completed', hasScored: true, eventStatus: 'completed',
  startDate: '2026-10-08T00:00:00Z', endDate: '2026-10-09T23:00:00Z',
  actionPath: `/participant/competition/events/${id}/score`, ...extra,
})

function seedWorld() {
  world = createFakeSupabase({
    event_participants: [
      { id: 'p-partial', event_id: 'partial', user_id: ME },
      { id: 'p-done', event_id: 'done', user_id: ME },
      { id: 'p-partial-other', event_id: 'partial', user_id: OTHER },
      { id: 'p-comp', event_id: 'comp', user_id: ME, judge_role: 'head_judge' },
    ],
    election_ballot_sections: [
      { id: 's1', event_id: 'partial', name: 'President and VP', display_order: 0 },
      { id: 's2', event_id: 'partial', name: 'Senators', display_order: 1 },
      { id: 's3', event_id: 'partial', name: 'Year representatives', display_order: 2 },
      { id: 's4', event_id: 'done', name: 'Main Election', display_order: 0 },
    ],
    election_ballot_submissions: [
      { ballot_section_id: 's1', participant_id: 'p-partial', submitted_at: '2026-03-12T08:29:00Z' },
      { ballot_section_id: 's2', participant_id: 'p-partial', submitted_at: '2026-03-12T08:31:00Z' },
      // Someone else's submission for the third section must not count for me.
      { ballot_section_id: 's3', participant_id: 'p-partial-other', submitted_at: '2026-03-12T09:00:00Z' },
      { ballot_section_id: 's4', participant_id: 'p-done', submitted_at: '2026-03-11T10:00:00Z' },
    ],
    poll_submissions: [
      { event_id: 'poll-open', voter_id: ME, completed_at: '2026-02-03T09:41:00Z' },
      { event_id: 'poll-open', voter_id: OTHER, completed_at: '2026-02-06T09:00:00Z' },
    ],
    competition_round_submissions: [
      { event_id: 'comp', round_id: 'r1', judge_id: ME, status: 'submitted', submitted_at: '2026-10-08T12:40:00Z' },
      { event_id: 'comp', round_id: 'r2', judge_id: ME, status: 'submitted', submitted_at: '2026-10-09T12:52:00Z' },
      { event_id: 'comp', round_id: 'r2', judge_id: OTHER, status: 'submitted', submitted_at: '2026-10-09T13:30:00Z' },
      { event_id: 'comp', round_id: 'r1', judge_id: ME, status: 'invalidated', submitted_at: '2026-10-08T11:00:00Z' },
    ],
    competition_rounds: [{ id: 'r1', name: 'Preliminary' }, { id: 'r2', name: 'Final' }],
    competition_result_calculations: [
      { event_id: 'comp', status: 'published', round_id: null, published_at: '2026-10-10T00:00:00Z' },
    ],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seedWorld()
})
afterEach(() => vi.useRealTimers())

describe('isEventClosed / historyOutcome', () => {
  test('closed by status or by a passed end date', () => {
    expect(isEventClosed({ eventStatus: 'completed' })).toBe(true)
    expect(isEventClosed({ eventStatus: 'active', endDate: '2026-01-01' })).toBe(true)
    expect(isEventClosed({ eventStatus: 'active', endDate: '2027-01-01' })).toBe(false)
    expect(isEventClosed({ eventStatus: 'active' })).toBe(false)
  })

  test.each([
    ['voted', election('a', { hasVoted: true }), 'Submitted'],
    ['all sections', election('a', { submittedSections: 3, totalSections: 3 }), 'Submitted'],
    ['some sections, closed', election('a', { submittedSections: 1, totalSections: 3 }), 'Partial'],
    ['none, closed', election('a'), 'Missed'],
    ['none, still open', election('a', { eventStatus: 'active', endDate: '2027-01-01T00:00:00Z' }), null],
    ['some sections, still open', election('a', { submittedSections: 1, totalSections: 3, eventStatus: 'active', endDate: '2027-01-01T00:00:00Z' }), null],
    ['poll responded', poll('a'), 'Submitted'],
    ['poll missed', poll('a', { hasResponded: false }), 'Missed'],
    ['poll open, no response', poll('a', { hasResponded: false, eventStatus: 'active', endDate: '2027-01-01T00:00:00Z' }), null],
    ['scored', competition('a'), 'Submitted'],
    ['not scored, closed', competition('a', { hasScored: false }), 'Missed'],
    ['not scored, open', competition('a', { hasScored: false, eventStatus: 'active', endDate: '2027-01-01T00:00:00Z' }), null],
  ])('%s', (_name, event, expected) => {
    expect(historyOutcome(event, NOW)?.outcome ?? null).toBe(expected)
  })

  test('native competition: all rounds submitted, some, none', () => {
    const native = (states, extra = {}) => competition('n', { hasScored: false, nativeContexts: states.map((state) => ({ state })), ...extra })
    expect(historyOutcome(native(['submitted', 'submitted']), NOW)).toMatchObject({ outcome: 'Submitted', summary: '2 rounds submitted' })
    expect(historyOutcome(native(['submitted', 'closed']), NOW)).toMatchObject({ outcome: 'Partial', summary: '1 of 2 rounds submitted' })
    expect(historyOutcome(native(['closed', 'closed']), NOW).outcome).toBe('Missed')
    expect(historyOutcome(native(['submitted', 'open'], { eventStatus: 'active', endDate: '2027-01-01T00:00:00Z' }), NOW)).toBeNull()
  })
})

describe('getParticipantEvents (My events)', () => {
  const events = [
    election('later', { bucket: 'assigned', eventStatus: 'scheduled', startDate: '2026-12-02T00:00:00Z', endDate: '2026-12-04T00:00:00Z' }),
    election('now', { bucket: 'active', eventStatus: 'active', startDate: '2026-11-10T00:00:00Z', endDate: '2026-11-20T00:00:00Z' }),
    poll('poll-now', { bucket: 'active', hasResponded: false, eventStatus: 'active', startDate: '2026-11-12T00:00:00Z', endDate: '2026-11-22T00:00:00Z' }),
    election('finished', { bucket: 'completed', hasVoted: true }),
    election('missed', { bucket: 'assigned' }),
  ]

  test('lists only active and upcoming events, active first, and leaves completed and missed ones to History', async () => {
    loadClassifiedEvents.mockResolvedValue(events)
    const result = await getParticipantEvents(ME)
    expect(result.events.map((e) => e.id)).toEqual(['now', 'poll-now', 'later'])
    expect(result.counts).toEqual({ active: 2, assigned: 1 })
  })

  test('filters by bucket, type and search, and paginates', async () => {
    loadClassifiedEvents.mockResolvedValue(events)
    expect((await getParticipantEvents(ME, { bucket: 'assigned' })).events.map((e) => e.id)).toEqual(['later'])
    expect((await getParticipantEvents(ME, { type: 'poll' })).events.map((e) => e.id)).toEqual(['poll-now'])
    expect((await getParticipantEvents(ME, { search: 'ELECTION NOW' })).events.map((e) => e.id)).toEqual(['now'])
    const page = await getParticipantEvents(ME, { limit: '1', page: '2' })
    expect(page.events.map((e) => e.id)).toEqual(['poll-now'])
    expect(page.total).toBe(3)
  })
})

describe('getParticipantHistory', () => {
  const studentEvents = () => [
    election('partial', { submittedSections: 2, totalSections: 3 }),
    election('done', { hasVoted: true, submittedSections: 1, totalSections: 1, startDate: '2026-03-10T00:00:00Z', endDate: '2026-03-12T00:00:00Z' }),
    election('missed', { endDate: '2026-01-20T00:00:00Z', startDate: '2026-01-18T00:00:00Z', canViewResults: false, resultsVisibility: 'hidden' }),
    election('still-open', { eventStatus: 'active', endDate: '2027-01-01T00:00:00Z', canViewResults: false }),
    election('ancient', { hasVoted: true, startDate: '2024-03-10T00:00:00Z', endDate: '2024-03-12T00:00:00Z' }),
    poll('poll-open'),
    poll('poll-anon', { pollAnonymous: true, endDate: '2026-04-07T00:00:00Z' }),
  ]

  test('a partial ballot shows each section with its own submitted time, never the selections', async () => {
    loadClassifiedEvents.mockResolvedValue(studentEvents())
    const { items } = await getParticipantHistory(ME)
    const partial = items.find((r) => r.eventId === 'partial')
    expect(partial).toMatchObject({ outcome: 'Partial', summary: '2 of 3 sections submitted', role: 'Student', completedAt: '2026-03-12T08:31:00.000Z' })
    expect(partial.receipt).toEqual({
      kind: 'sections',
      rows: [
        { name: 'President and VP', submittedAt: '2026-03-12T08:29:00Z', status: 'Submitted' },
        { name: 'Senators', submittedAt: '2026-03-12T08:31:00Z', status: 'Submitted' },
        { name: 'Year representatives', submittedAt: null, status: 'Not submitted' },
      ],
    })
    expect(JSON.stringify(items)).not.toMatch(/candidate|selection|vote_id/i)
  })

  test('does not leak another account\'s submissions', async () => {
    loadClassifiedEvents.mockResolvedValue(studentEvents())
    const { items } = await getParticipantHistory(ME)
    expect(items.find((r) => r.eventId === 'partial').receipt.rows[2].submittedAt).toBeNull()
    const poll1 = items.find((r) => r.eventId === 'poll-open')
    expect(poll1.completedAt).toBe('2026-02-03T09:41:00.000Z')
    expect(poll1.receipt).toEqual({ kind: 'poll', responses: 1, anonymous: false })
  })

  test('anonymous polls have no timestamp but still show a response and the privacy flag', async () => {
    loadClassifiedEvents.mockResolvedValue(studentEvents())
    const { items } = await getParticipantHistory(ME)
    const anon = items.find((r) => r.eventId === 'poll-anon')
    expect(anon.completedAt).toBeNull()
    expect(anon.sortDate).toBe('2026-04-07T00:00:00Z')
    expect(anon.receipt).toEqual({ kind: 'poll', responses: 1, anonymous: true })
  })

  test('missed events are listed with no completion time; events still in progress are not', async () => {
    loadClassifiedEvents.mockResolvedValue(studentEvents())
    const { items } = await getParticipantHistory(ME, { range: 'all' })
    const missed = items.find((r) => r.eventId === 'missed')
    expect(missed).toMatchObject({ outcome: 'Missed', completedAt: null, summary: 'No ballot submitted', results: { state: 'none' } })
    expect(items.find((r) => r.eventId === 'still-open')).toBeUndefined()
  })

  test('defaults to the last 12 months; range=all includes older events', async () => {
    loadClassifiedEvents.mockResolvedValue(studentEvents())
    expect((await getParticipantHistory(ME)).items.map((r) => r.eventId)).not.toContain('ancient')
    expect((await getParticipantHistory(ME, { range: 'all' })).items.map((r) => r.eventId)).toContain('ancient')
  })

  test('sorts newest first and filters by type, outcome and search', async () => {
    loadClassifiedEvents.mockResolvedValue(studentEvents())
    const all = await getParticipantHistory(ME)
    const dates = all.items.map((r) => new Date(r.sortDate).getTime())
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
    expect((await getParticipantHistory(ME, { type: 'poll' })).items.every((r) => r.eventType === 'polling')).toBe(true)
    expect((await getParticipantHistory(ME, { outcome: 'missed' })).items.map((r) => r.outcome)).toEqual(['Missed'])
    expect((await getParticipantHistory(ME, { outcome: 'done' })).items.some((r) => r.outcome === 'Missed')).toBe(false)
    expect((await getParticipantHistory(ME, { search: 'library' })).items.map((r) => r.eventId).sort()).toEqual(['poll-anon', 'poll-open'])
  })

  test('summary covers the range, not the type/outcome/search filter', async () => {
    loadClassifiedEvents.mockResolvedValue(studentEvents())
    const filtered = await getParticipantHistory(ME, { type: 'poll' })
    expect(filtered.summary).toMatchObject({ total: 5, tookPart: 4, missed: 1, participationRate: 80, ballots: 2, polls: 2, partial: 1 })
  })

  test('paginates', async () => {
    loadClassifiedEvents.mockResolvedValue(studentEvents())
    const page = await getParticipantHistory(ME, { limit: '2', page: '2' })
    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(5)
  })

  test('election results state: available, pending, none', async () => {
    loadClassifiedEvents.mockResolvedValue([
      election('done', { hasVoted: true }),
      election('later', { hasVoted: true, canViewResults: false, resultsVisibility: 'public', endDate: '2026-11-01T00:00:00Z', startDate: '2026-10-30T00:00:00Z' }),
      election('hidden', { hasVoted: true, canViewResults: false, resultsVisibility: 'hidden', endDate: '2026-11-02T00:00:00Z', startDate: '2026-10-30T00:00:00Z' }),
    ])
    const { items } = await getParticipantHistory(ME)
    const byId = Object.fromEntries(items.map((r) => [r.eventId, r.results]))
    expect(byId.done).toEqual({ state: 'available' })
    expect(byId.later).toMatchObject({ state: 'pending' })
    expect(byId.hidden).toEqual({ state: 'none' })
  })

  test('a judge sees rounds, their role, a scoresheet link and the published status, only from their own submissions', async () => {
    loadClassifiedEvents.mockResolvedValue([competition('comp')])
    const { items, summary } = await getParticipantHistory(ME)
    const row = items[0]
    expect(row).toMatchObject({
      outcome: 'Submitted', role: 'Head judge', summary: '2 rounds submitted',
      completedAt: '2026-10-09T12:52:00.000Z', scoresheetPath: '/participant/competition/events/comp/score',
      results: { state: 'available', publishedAt: '2026-10-10T00:00:00Z' },
    })
    expect(row.receipt.rows).toEqual([
      { name: 'Preliminary', submittedAt: '2026-10-08T12:40:00Z', status: 'Submitted' },
      { name: 'Final', submittedAt: '2026-10-09T12:52:00Z', status: 'Submitted' },
    ])
    expect(summary).toMatchObject({ eventsJudged: 1, roundsSubmitted: 2 })
  })

  test('a missed competition has no scoresheet link', async () => {
    loadClassifiedEvents.mockResolvedValue([competition('comp', { hasScored: false })])
    const { items } = await getParticipantHistory(ME)
    expect(items[0]).toMatchObject({ outcome: 'Missed', scoresheetPath: null })
  })

  test('still returns a History when the competition detail tables are unavailable', async () => {
    world.failNext('competition_round_submissions', 'select', 'relation does not exist')
    loadClassifiedEvents.mockResolvedValue([competition('comp')])
    const { items } = await getParticipantHistory(ME)
    expect(items[0]).toMatchObject({ outcome: 'Submitted', summary: 'Scores submitted' })
    expect(items[0].receipt.rows).toEqual([])
  })
})

describe('getParticipantResults', () => {
  test('lists visible elections and pending ones, never hidden ones, with no result bodies', async () => {
    loadClassifiedEvents.mockResolvedValue([
      election('final'),
      election('live', { eventStatus: 'active', endDate: '2026-12-01T00:00:00Z', resultsVisibility: 'real_time' }),
      election('soon', { canViewResults: false, eventStatus: 'active', endDate: '2026-12-04T00:00:00Z' }),
      election('hidden', { canViewResults: false, resultsVisibility: 'hidden' }),
      poll('p'),
    ])
    const { items } = await getParticipantResults(ME)
    expect(items.map((i) => [i.eventId, i.state])).toEqual([['live', 'live'], ['final', 'final'], ['soon', 'pending']])
    expect(items.every((i) => !('results' in i) && !('standings' in i))).toBe(true)
    expect(items.find((i) => i.eventId === 'soon').availableAfter).toBe('2026-12-04T00:00:00Z')
  })

  test('lists published workflow competitions as official standings only', async () => {
    loadClassifiedEvents.mockResolvedValue([competition('wf'), competition('unpublished')])
    judgePublishedResults.mockImplementation(async (eventId) => (eventId === 'wf'
      ? { publishedAt: '2026-10-10T00:00:00Z', method: 'weighted', results: [{ rank: 1, contestantName: 'Carla', contestantNumber: '07', finalScore: 94.2 }, { rank: 2, contestantName: 'Dani', contestantNumber: '03', manual: true }] }
      : { publishedAt: null, results: [] }))
    const { items } = await getParticipantResults(ME)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'competition', eventId: 'wf', state: 'published', method: 'weighted' })
    expect(items[0].standings).toEqual([
      { rank: 1, entryNumber: '07', name: 'Carla', score: 94.2, manual: false },
      { rank: 2, entryNumber: '03', name: 'Dani', score: null, manual: true },
    ])
    expect(judgePublishedResults).toHaveBeenCalledWith('wf', ME)
  })

  test('native competitions: published standings listed, withdrawn and unpublished skipped, one failure does not break the page', async () => {
    loadClassifiedEvents.mockResolvedValue([
      competition('nat', { nativeContexts: [{ competitionId: 'c-pub' }, { competitionId: 'c-withdrawn' }, { competitionId: 'c-missing' }, { competitionId: 'c-boom' }] }),
      election('final'),
    ])
    publicResults.mockImplementation(async (_eventId, competitionId) => {
      if (competitionId === 'c-pub') {
        return { publicationVersion: 2, publishedAt: '2026-10-10T00:00:00Z', results: { competitionName: 'Pageant', roundName: 'Final', method: 'weighted', standings: [{ rank: 1, entryNumber: '07', name: 'Carla', score: 94.2 }] } }
      }
      if (competitionId === 'c-withdrawn') return { withdrawn: true, results: null }
      if (competitionId === 'c-missing') throw Object.assign(new Error('Published results are unavailable'), { statusCode: 404 })
      throw new Error('boom')
    })
    const { items } = await getParticipantResults(ME)
    expect(items.map((i) => i.id).sort()).toEqual(['competition:nat:c-pub', 'election:final'])
    expect(items.find((i) => i.kind === 'competition')).toMatchObject({ competitionName: 'Pageant', roundName: 'Final', publicationVersion: 2 })
  })

  test('filters by kind', async () => {
    loadClassifiedEvents.mockResolvedValue([election('final'), competition('wf')])
    judgePublishedResults.mockResolvedValue({ publishedAt: '2026-10-10T00:00:00Z', results: [{ rank: 1, contestantName: 'Carla', finalScore: 90 }] })
    expect((await getParticipantResults(ME, { type: 'election' })).items.map((i) => i.kind)).toEqual(['election'])
    expect((await getParticipantResults(ME, { type: 'competition' })).items.map((i) => i.kind)).toEqual(['competition'])
  })
})
