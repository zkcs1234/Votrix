// Stage group — simultaneous multi-contestant scoring.
//
// Verifies that when multiple contestants are on stage (session.active_contestant_ids),
// a judge's submission targets the SPECIFIC contestant it names — not just the
// single primary active contestant.

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
  const rec = (op, payload) => ((state.writes[table] ??= []).push({ op, payload }))
  const chain = {
    select: () => chain,
    insert: (p) => { rec('insert', p); return chain },
    update: (p) => { rec('update', p); return chain },
    delete: () => { rec('delete', null); return chain },
    eq: () => chain, neq: () => chain, in: () => chain, or: () => chain, is: () => chain,
    order: () => chain, limit: () => chain,
    single: () => Promise.resolve(resolveNext()),
    maybeSingle: () => Promise.resolve(resolveNext()),
    then: (f, r) => Promise.resolve(resolveNext()).then(f, r),
  }
  return chain
}

vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn(() => ({ from: fromImpl })) }))
vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'evt', event_type: 'competition_scoring' })),
  getEventById: vi.fn(async (id) => ({ id, title: 'E', event_type: 'competition_scoring', scoring_config: {} })),
}))
vi.mock('../../src/services/pageant.service.js', () => ({
  assertJudgeEnrolled: vi.fn(async () => ({ id: 'enr' })),
  canJudgeScore: vi.fn(async () => true),
}))
vi.mock('../../src/foundation/audit.js', () => ({ recordAudit: vi.fn(() => null) }))
vi.mock('../../src/websocket/ws-emitter.js', () => ({
  emitToEvent: vi.fn(), emitToEventOrganizer: vi.fn(), emitToEventVoters: vi.fn(), emitToUser: vi.fn(),
}))

let submitJudgeSessionScore
beforeEach(async () => {
  vi.clearAllMocks()
  submitJudgeSessionScore = (await import('../../src/services/competition-session.service.js')).submitJudgeSessionScore
})

describe('stage group — targeted submission', () => {
  test('submits for the named on-stage contestant, not the primary', async () => {
    state = makeState({
      v_competition_active_session: [
        {
          data: {
            id: 's1', event_id: 'evt', status: 'active',
            active_contestant_id: 'c1',
            active_contestant_ids: ['c1', 'c2'], // both on stage
            contestant_order: ['c1', 'c2'],
            current_round_id: 'r1', current_contestant_order: 0,
          },
          error: null,
        },
      ],
      competition_rounds: [{ data: { finalized_at: null }, error: null }],
      competition_session_judge_scores: [
        { data: null, error: null }, // no existing for c2
        { data: { id: 'sjs', is_locked: true }, error: null }, // insert
      ],
      competition_round_criteria: [{ data: [{ criteria_id: 'k1' }], error: null }],
      competition_criteria: [
        { data: [{ id: 'k1', event_id: 'evt', name: 'K', percentage: 100, min_score: 0, max_score: 100 }], error: null },
      ],
      competition_scores: [{ data: null, error: null }, { data: null, error: null }],
    })

    await submitJudgeSessionScore('evt', 'judge-1', { contestantId: 'c2', scores: { k1: 80 } })

    // The session-score insert is for c2 (the named contestant), not c1 (primary).
    const sjsInsert = (state.writes['competition_session_judge_scores'] ?? []).find((w) => w.op === 'insert')
    expect(sjsInsert.payload.contestant_id).toBe('c2')
    // And the ranking-store bridge writes c2 too.
    const rankInsert = (state.writes['competition_scores'] ?? []).find((w) => w.op === 'insert')
    expect(rankInsert.payload[0].contestant_id).toBe('c2')
  })

  test('rejects a contestant not on stage', async () => {
    state = makeState({
      v_competition_active_session: [
        {
          data: {
            id: 's1', event_id: 'evt', status: 'active',
            active_contestant_id: 'c1', active_contestant_ids: ['c1', 'c2'],
            contestant_order: ['c1', 'c2'], current_round_id: 'r1', current_contestant_order: 0,
          },
          error: null,
        },
      ],
    })
    await expect(
      submitJudgeSessionScore('evt', 'judge-1', { contestantId: 'c9', scores: { k1: 80 } }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
