// Awards (Phase 1) — derived winner computation (score / criteria).
// Verifies that a derived award picks the correct winner from existing rankings
// without any new scoring, and respects division scoping.

import { describe, test, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  awards: [],
  rankingsByDivision: {},
  selections: [], // { contestant_id }
  contestants: [], // { id, name, contestant_number, photo }
  judgeCount: 0,
}))

function dataFor(table) {
  switch (table) {
    case 'competition_awards':
      return { data: h.awards, error: null }
    case 'competition_award_selections':
      return { data: h.selections, error: null }
    case 'competition_contestants':
      return { data: h.contestants, error: null, count: h.contestants.length }
    case 'event_participants':
      return { data: [], error: null, count: h.judgeCount }
    default:
      return { data: [], error: null, count: 0 }
  }
}

function fromImpl(table) {
  const resolved = () => dataFor(table)
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    then: (onF, onR) => Promise.resolve(resolved()).then(onF, onR),
  }
  return chain
}

vi.mock('../../src/foundation/index.js', () => ({ db: vi.fn(() => ({ from: fromImpl })) }))
vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'evt', event_type: 'competition_scoring' })),
}))
vi.mock('../../src/services/pageant.service.js', () => ({
  getLiveRankings: vi.fn(async (_e, _o, { divisionId } = {}) => ({
    rankings: h.rankingsByDivision[divisionId ?? '__all__'] ?? [],
  })),
}))

let computeAwardWinners

beforeEach(async () => {
  vi.clearAllMocks()
  h.awards = []
  h.rankingsByDivision = {}
  h.selections = []
  h.contestants = []
  h.judgeCount = 0
  computeAwardWinners = (await import('../../src/services/competition-award.service.js')).computeAwardWinners
})

const row = (id, num, name, perRound = [], crit = []) => ({
  contestantId: id, contestantNumber: num, contestantName: name, photo: null,
  perRound, criteriaBreakdown: crit,
})

describe('derived award winners', () => {
  test('score award picks the highest score in the source round', async () => {
    h.awards = [{ id: 'a1', event_id: 'evt', name: 'Best in Talent', method: 'score', source_round_id: 'r1', status: 'draft', display_order: 0, created_at: 't' }]
    h.rankingsByDivision['__all__'] = [
      row('c1', 1, 'Alice', [{ roundId: 'r1', value: 84.75 }]),
      row('c2', 2, 'Bob', [{ roundId: 'r1', value: 94.0 }]),
      row('c3', 3, 'Cara', [{ roundId: 'r1', value: 89.2 }]),
    ]
    const [award] = await computeAwardWinners('evt', 'org')
    expect(award.winner).toMatchObject({ contestantId: 'c2', value: 94.0 })
  })

  test('criteria award picks the highest average of the source criterion', async () => {
    h.awards = [{ id: 'a2', event_id: 'evt', name: 'Best Stage Presence', method: 'criteria', source_criteria_id: 'k9', status: 'draft', display_order: 0, created_at: 't' }]
    h.rankingsByDivision['__all__'] = [
      row('c1', 1, 'Alice', [], [{ criteriaId: 'k9', average: 92 }]),
      row('c2', 2, 'Bob', [], [{ criteriaId: 'k9', average: 88 }]),
      row('c3', 3, 'Cara', [], [{ criteriaId: 'k9', average: 95 }]),
    ]
    const [award] = await computeAwardWinners('evt', 'org')
    expect(award.winner).toMatchObject({ contestantId: 'c3', value: 95 })
  })

  test('division-scoped award reads only that division rankings', async () => {
    h.awards = [{ id: 'a3', event_id: 'evt', name: 'Best Female Talent', method: 'score', source_round_id: 'r1', division_id: 'dF', status: 'draft', display_order: 0, created_at: 't' }]
    h.rankingsByDivision['dF'] = [row('f1', 5, 'Fiona', [{ roundId: 'r1', value: 77 }])]
    h.rankingsByDivision['__all__'] = [row('x', 9, 'Other', [{ roundId: 'r1', value: 99 }])]
    const [award] = await computeAwardWinners('evt', 'org')
    expect(award.winner).toMatchObject({ contestantId: 'f1', value: 77 })
  })

  test('no scores yet → winner null, still returned', async () => {
    h.awards = [{ id: 'a4', event_id: 'evt', name: 'Best in Talent', method: 'score', source_round_id: 'r1', status: 'draft', display_order: 0, created_at: 't' }]
    h.rankingsByDivision['__all__'] = [row('c1', 1, 'Alice', [{ roundId: 'r1', value: null }])]
    const [award] = await computeAwardWinners('evt', 'org')
    expect(award.winner).toBeNull()
    expect(award.resolvable).toBe(true)
  })
})

describe('interactive award tally (vote / selection)', () => {
  test('vote award winner is the contestant with the most picks', async () => {
    h.awards = [{ id: 'v1', event_id: 'evt', name: 'Best Dressed', method: 'vote', status: 'open', display_order: 0, created_at: 't' }]
    h.contestants = [
      { id: 'c1', name: 'Alice', contestant_number: 1, photo: null },
      { id: 'c2', name: 'Bob', contestant_number: 2, photo: null },
    ]
    h.judgeCount = 4
    h.selections = [{ contestant_id: 'c1' }, { contestant_id: 'c1' }, { contestant_id: 'c2' }, { contestant_id: 'c1' }]
    const [award] = await computeAwardWinners('evt', 'org')
    expect(award.winner).toMatchObject({ contestantId: 'c1' })
    expect(award.votes).toBe(3)
    expect(award.submitted).toBe(4)
    expect(award.totalJudges).toBe(4)
    expect(award.tie).toBe(false)
  })

  test('tie is flagged when top picks are equal', async () => {
    h.awards = [{ id: 'v2', event_id: 'evt', name: 'Best Smile', method: 'selection', status: 'open', display_order: 0, created_at: 't' }]
    h.contestants = [
      { id: 'c1', name: 'Alice', contestant_number: 1, photo: null },
      { id: 'c2', name: 'Bob', contestant_number: 2, photo: null },
    ]
    h.judgeCount = 2
    h.selections = [{ contestant_id: 'c1' }, { contestant_id: 'c2' }]
    const [award] = await computeAwardWinners('evt', 'org')
    expect(award.tie).toBe(true)
    expect(award.votes).toBe(1)
  })
})
