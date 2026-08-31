// Phase 0 (workflow redesign) — characterization of the S2 "all-criteria fallback".
//
// TODAY: when the active round has NO rows in competition_round_criteria, the
// judge scoring view falls back to returning EVERY event-wide criterion. This is
// the root of the "every round shows the same criteria" complaint.
//
// This test LOCKS that behavior so the redesign can change it deliberately (and
// provably), never silently. It is EXPECTED TO PASS on the current code. The
// recommended Phase 2 fix is UX-only (keep this fallback, guide the organizer),
// so this test should keep passing; if a future strict-mode (Phase 6) changes
// the fallback, update this test in that same commit.

import { describe, test, expect, vi, beforeEach } from 'vitest'

let state
function makeState(responses) {
  return { responses, idx: {}, touched: new Set() }
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
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    in: () => chain,
    or: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(resolveNext()),
    maybeSingle: () => Promise.resolve(resolveNext()),
    then: (onF, onR) => Promise.resolve(resolveNext()).then(onF, onR),
  }
  return chain
}

vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn(() => ({ from: fromImpl })) }))
vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'evt', event_type: 'competition_scoring' })),
  getEventById: vi.fn(async () => ({ id: 'evt', title: 'Test', event_type: 'competition_scoring', scoring_config: {} })),
}))
vi.mock('../../src/services/pageant.service.js', () => ({
  assertJudgeEnrolled: vi.fn(async () => ({ id: 'e1' })),
  canJudgeScore: vi.fn(async () => true),
}))
vi.mock('../../src/websocket/ws-emitter.js', () => ({
  emitToEvent: vi.fn(), emitToEventOrganizer: vi.fn(), emitToEventVoters: vi.fn(), emitToUser: vi.fn(),
}))

let getJudgeSessionView

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import('../../src/services/competition-session.service.js')
  getJudgeSessionView = mod.getJudgeSessionView
})

describe('S2 fallback — round with no assigned criteria returns ALL event criteria', () => {
  test('an unconfigured round inherits every event-wide criterion', async () => {
    state = makeState({
      v_competition_active_session: [
        {
          data: {
            id: 's1', event_id: 'evt', status: 'active',
            active_contestant_id: 'c1', current_contestant_order: 0,
            contestant_order: ['c1'], current_round_id: 'r1',
          },
          error: null,
        },
      ],
      competition_contestants: [
        { data: [{ id: 'c1', event_id: 'evt', name: 'Alice', photo: null, contestant_number: 1 }], error: null },
      ],
      // The active round r1 has NO criteria assigned -> triggers the fallback.
      competition_round_criteria: [{ data: [], error: null }],
      // Fallback path reads ALL event-wide criteria.
      competition_criteria: [
        {
          data: [
            { id: 'k1', event_id: 'evt', name: 'Talent-Skill', percentage: 50, min_score: 0, max_score: 100 },
            { id: 'k2', event_id: 'evt', name: 'Gown-Poise', percentage: 50, min_score: 0, max_score: 100 },
          ],
          error: null,
        },
      ],
      competition_session_judge_scores: [{ data: [], error: null }],
    })

    const view = await getJudgeSessionView('evt', 'judge-1')

    // CURRENT behavior: the round shows BOTH event criteria even though neither
    // was assigned to it — this is exactly the "same criteria on every round" smell.
    expect(view.criteria.map((c) => c.name).sort()).toEqual(['Gown-Poise', 'Talent-Skill'])
    expect(view.criteria).toHaveLength(2)
  })
})
