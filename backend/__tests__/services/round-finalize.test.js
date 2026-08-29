// Phase 6 — finalizeRound integration (highest-risk op: eliminates contestants).
//
// Verifies the happy path end to end with a table-tracking DB mock: computes the
// round standing, snapshots ALL contestants (qualified flag per top_n=2), marks
// the round finalized, and seeds ONLY the qualifiers into the next round.

import { describe, test, expect, vi, beforeEach } from 'vitest'

let state

function makeState(responses) {
  return { responses, idx: {}, writes: {}, touched: new Set() }
}

function fromImpl(table) {
  state.touched.add(table)
  if (!(table in state.idx)) state.idx[table] = 0
  const resolveNext = () => {
    const list = state.responses[table] || []
    const r = list[state.idx[table]] ?? { data: null, error: null }
    state.idx[table] += 1
    return r
  }
  const rec = (op, payload) => {
    ;(state.writes[table] ??= []).push({ op, payload })
  }
  const chain = {
    select: () => chain,
    insert: (p) => { rec('insert', p); return chain },
    update: (p) => { rec('update', p); return chain },
    upsert: (p) => { rec('upsert', p); return chain },
    delete: () => { rec('delete', null); return chain },
    eq: () => chain, neq: () => chain, in: () => chain, or: () => chain, is: () => chain,
    gt: () => chain, lt: () => chain, not: () => chain,
    order: () => chain, limit: () => chain, range: () => chain,
    single: () => Promise.resolve(resolveNext()),
    maybeSingle: () => Promise.resolve(resolveNext()),
    then: (onF, onR) => Promise.resolve(resolveNext()).then(onF, onR),
  }
  return chain
}

const h = vi.hoisted(() => ({ divisionsEnabled: false }))

vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn(() => ({ from: fromImpl })) }))

vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'evt', event_type: 'competition_scoring' })),
  getEventById: vi.fn(async () => ({ id: 'evt', scoring_config: {}, divisions_enabled: h.divisionsEnabled })),
}))

vi.mock('../../src/services/pageant.service.js', () => ({
  assertJudgeEnrolled: vi.fn(async () => ({})),
  canJudgeScore: vi.fn(() => true),
  getLiveRankings: vi.fn(async () => ({ rankings: [] })),
}))

vi.mock('../../src/websocket/ws-emitter.js', () => ({
  emitToEvent: vi.fn(), emitToEventOrganizer: vi.fn(), emitToEventVoters: vi.fn(), emitToUser: vi.fn(),
}))

let finalizeRound

beforeEach(async () => {
  vi.clearAllMocks()
  h.divisionsEnabled = false
  const mod = await import('../../src/services/competition-session.service.js')
  finalizeRound = mod.finalizeRound
})

describe('finalizeRound — top_n advancement', () => {
  test('snapshots the standing and seeds only the top 2 into the next round', async () => {
    const round = {
      id: 'r1', event_id: 'evt', name: 'Preliminary', display_order: 0,
      is_open: false, finalized_at: null,
      advancement_type: 'top_n', advancement_value: 2, score_policy: 'independent',
    }
    state = makeState({
      competition_rounds: [
        { data: round, error: null },                       // fetch round
        { data: [{ id: 'r1' }], error: null },              // atomic claim (finalized_at flip)
        { data: { id: 'r2', name: 'Final', display_order: 1 }, error: null }, // getNextRound
      ],
      competition_round_contestants: [
        { data: [], error: null }, // no assigned -> all event contestants
        { error: null },           // upsert seed
      ],
      competition_contestants: [
        {
          data: [
            { id: 'c1', name: 'A', contestant_number: 1, division_id: null },
            { id: 'c2', name: 'B', contestant_number: 2, division_id: null },
            { id: 'c3', name: 'C', contestant_number: 3, division_id: null },
          ],
          error: null,
        },
      ],
      competition_round_criteria: [{ data: [], error: null }],
      competition_criteria: [{ data: [{ id: 'k1', name: 'K', percentage: 100 }], error: null }],
      competition_scores: [
        {
          data: [
            { contestant_id: 'c1', criteria_id: 'k1', round_id: 'r1', score: 90 },
            { contestant_id: 'c2', criteria_id: 'k1', round_id: 'r1', score: 80 },
            { contestant_id: 'c3', criteria_id: 'k1', round_id: 'r1', score: 70 },
          ],
          error: null,
        },
      ],
      competition_round_results: [
        { data: null, error: null }, // delete prior
        { error: null },             // insert snapshot
      ],
    })

    const res = await finalizeRound('evt', 'org', 'r1', { overrides: null })

    // Qualifiers: top 2 by score.
    expect(res.qualifiers.sort()).toEqual(['c1', 'c2'])
    expect(res.nextRoundId).toBe('r2')
    expect(res.seededCount).toBe(2)

    // Snapshot: all three ranked, only top two qualified.
    const insert = (state.writes['competition_round_results'] ?? []).find((w) => w.op === 'insert')
    expect(insert).toBeDefined()
    const byId = Object.fromEntries(insert.payload.map((r) => [r.contestant_id, r]))
    expect(byId.c1).toMatchObject({ rank: 1, qualified: true })
    expect(byId.c2).toMatchObject({ rank: 2, qualified: true })
    expect(byId.c3).toMatchObject({ rank: 3, qualified: false })

    // Round marked finalized.
    const roundUpdate = (state.writes['competition_rounds'] ?? []).find((w) => w.op === 'update')
    expect(roundUpdate.payload.finalized_at).toBeTruthy()

    // Only qualifiers seeded into the next round.
    const seed = (state.writes['competition_round_contestants'] ?? []).find((w) => w.op === 'upsert')
    expect(seed.payload.map((r) => r.contestant_id).sort()).toEqual(['c1', 'c2'])
    expect(seed.payload.every((r) => r.round_id === 'r2')).toBe(true)
  })

  test('H1: divisions enabled — top_n applies PER division', async () => {
    h.divisionsEnabled = true
    const round = {
      id: 'r1', event_id: 'evt', name: 'Preliminary', display_order: 0,
      is_open: false, finalized_at: null,
      advancement_type: 'top_n', advancement_value: 1, score_policy: 'independent',
    }
    state = makeState({
      competition_rounds: [
        { data: round, error: null },
        { data: [{ id: 'r1' }], error: null }, // claim
        { data: { id: 'r2', name: 'Final', display_order: 1 }, error: null }, // next round
      ],
      competition_divisions: [{ data: [{ id: 'dA' }, { id: 'dB' }], error: null }],
      // computeRoundStanding runs once per division: round_contestants, contestants,
      // round_criteria, criteria, scores — then a final upsert to seed the next round.
      competition_round_contestants: [
        { data: [], error: null }, // dA assigned
        { data: [], error: null }, // dB assigned
        { error: null },           // seed upsert
      ],
      competition_contestants: [
        { data: [{ id: 'a1', name: 'A1', contestant_number: 1, division_id: 'dA' }], error: null },
        { data: [{ id: 'b1', name: 'B1', contestant_number: 2, division_id: 'dB' }], error: null },
      ],
      competition_round_criteria: [{ data: [], error: null }, { data: [], error: null }],
      competition_criteria: [
        { data: [{ id: 'k1', name: 'K', percentage: 100 }], error: null },
        { data: [{ id: 'k1', name: 'K', percentage: 100 }], error: null },
      ],
      competition_scores: [
        { data: [{ contestant_id: 'a1', criteria_id: 'k1', round_id: 'r1', score: 90 }], error: null },
        { data: [{ contestant_id: 'b1', criteria_id: 'k1', round_id: 'r1', score: 80 }], error: null },
      ],
      competition_round_results: [{ data: null, error: null }, { error: null }],
    })

    const res = await finalizeRound('evt', 'org', 'r1', { overrides: null })

    // top_n=1 PER DIVISION → the winner of each division advances (2 total),
    // not just the single highest scorer across the whole field.
    expect(res.qualifiers.sort()).toEqual(['a1', 'b1'])
    expect(res.seededCount).toBe(2)
    const insert = (state.writes['competition_round_results'] ?? []).find((w) => w.op === 'insert')
    const byId = Object.fromEntries(insert.payload.map((r) => [r.contestant_id, r]))
    expect(byId.a1).toMatchObject({ division_id: 'dA', rank: 1, qualified: true })
    expect(byId.b1).toMatchObject({ division_id: 'dB', rank: 1, qualified: true })
  })

  test('rejects finalizing an open round', async () => {
    state = makeState({
      competition_rounds: [
        { data: { id: 'r1', event_id: 'evt', name: 'Prelim', is_open: true, finalized_at: null, display_order: 0 }, error: null },
      ],
    })
    await expect(finalizeRound('evt', 'org', 'r1', {})).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  test('rejects re-finalizing an already finalized round', async () => {
    state = makeState({
      competition_rounds: [
        { data: { id: 'r1', event_id: 'evt', name: 'Prelim', is_open: false, finalized_at: '2026-01-01T00:00:00Z', display_order: 0 }, error: null },
      ],
    })
    await expect(finalizeRound('evt', 'org', 'r1', {})).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})
