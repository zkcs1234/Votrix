// Phase 0 anchor / Phase 3 verification — live-scores → rankings STORE BRIDGE (§7.1).
//
// Original defect (Phase 0): the live Judge Scoring flow wrote scores ONLY to
// `competition_session_judge_scores`, while the rankings engine
// (`getLiveRankings`) reads scores ONLY from `competition_scores`
// (DB_TABLES.JUDGE_SCORES) — so scores entered live never reached rankings.
//
// Phase 3 fix (write-through): `submitJudgeSessionScore` now ALSO bridges the
// flattened per-criterion values into `competition_scores` (delete-then-insert,
// null-round-safe). These tests now assert the FIXED behavior: a live
// submission writes BOTH stores. The `.toContain('competition_scores')`
// assertion below is the exact inverse of the Phase 0 anchor it replaced.

import { describe, test, expect, vi, beforeEach } from 'vitest'

// --- Table-tracking Supabase-style mock -------------------------------------
// `state` is swapped per-test; the db mock closes over a getter so each test
// controls its own responses/writes/touched sets.
let state

function makeState(responses) {
  return {
    responses, // { [table]: [response, ...] } consumed in order per table
    idx: {}, // per-table read cursor
    writes: {}, // { [table]: [{ op, payload }] }
    touched: new Set(), // every table passed to .from()
  }
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
  const recordWrite = (op, payload) => {
    ;(state.writes[table] ??= []).push({ op, payload })
  }

  const chain = {
    select: () => chain,
    insert: (p) => { recordWrite('insert', p); return chain },
    update: (p) => { recordWrite('update', p); return chain },
    upsert: (p) => { recordWrite('upsert', p); return chain },
    delete: () => { recordWrite('delete', null); return chain },
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    or: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    single: () => Promise.resolve(resolveNext()),
    maybeSingle: () => Promise.resolve(resolveNext()),
    then: (onF, onR) => Promise.resolve(resolveNext()).then(onF, onR),
  }
  return chain
}

vi.mock('../../src/foundation/db.js', () => ({
  db: vi.fn(() => ({ from: fromImpl })),
}))

vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'evt', event_type: 'competition_scoring' })),
  getEventById: vi.fn(async (id) => ({ id, title: 'Test Event', event_type: 'competition_scoring' })),
}))

vi.mock('../../src/services/pageant.service.js', () => ({
  assertJudgeEnrolled: vi.fn(async () => ({ id: 'enrollment-1', event_id: 'evt', user_id: 'judge-1' })),
  canJudgeScore: vi.fn(async () => true),
}))

vi.mock('../../src/websocket/ws-emitter.js', () => ({
  emitToEvent: vi.fn(),
  emitToEventOrganizer: vi.fn(),
  emitToEventVoters: vi.fn(),
  emitToUser: vi.fn(),
}))

let submitJudgeSessionScore

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import('../../src/services/competition-session.service.js')
  submitJudgeSessionScore = mod.submitJudgeSessionScore
})

describe('§7.1 live-session score submission — store disconnect', () => {
  const eventId = 'evt'
  const judgeId = 'judge-1'

  function seedHappyPath() {
    state = makeState({
      // getActiveSession() -> v_competition_active_session.maybeSingle()
      v_competition_active_session: [
        {
          data: {
            id: 'session-1',
            event_id: eventId,
            status: 'active',
            active_contestant_id: 'c1',
            current_contestant_order: 0,
            contestant_order: ['c1'],
            current_round_id: 'r1',
          },
          error: null,
        },
      ],
      // existing-score check (maybeSingle) -> none, then INSERT.select().single()
      competition_session_judge_scores: [
        { data: null, error: null },
        {
          data: {
            id: 'sjs-1',
            session_id: 'session-1',
            event_id: eventId,
            round_id: 'r1',
            contestant_id: 'c1',
            judge_id: judgeId,
            scores: { k1: 85 },
            is_locked: true,
          },
          error: null,
        },
      ],
      // round -> criteria membership
      competition_round_criteria: [{ data: [{ criteria_id: 'k1' }], error: null }],
      // criteria fetch (.in)
      competition_criteria: [
        {
          data: [
            { id: 'k1', event_id: eventId, name: 'Technique', percentage: 100, min_score: 0, max_score: 100 },
          ],
          error: null,
        },
      ],
      // Phase 3 write-through: bridge does delete (null-round-safe) then insert.
      competition_scores: [
        { data: null, error: null }, // delete
        { data: null, error: null }, // insert
      ],
    })
  }

  test('a live judge submission writes to competition_session_judge_scores', async () => {
    seedHappyPath()
    const res = await submitJudgeSessionScore(eventId, judgeId, { scores: { k1: 85 } })
    expect(res).toMatchObject({ success: true, locked: true })

    const sessionWrites = state.writes['competition_session_judge_scores'] ?? []
    expect(sessionWrites.some((w) => w.op === 'insert')).toBe(true)
  })

  test('PHASE 3 FIX: the same submission ALSO bridges into competition_scores', async () => {
    seedHappyPath()
    await submitJudgeSessionScore(eventId, judgeId, { scores: { k1: 85 } })

    // The ranking store is now written on the live path (delete-then-insert).
    const rankingWrites = state.writes['competition_scores'] ?? []
    expect([...state.touched]).toContain('competition_scores')
    expect(rankingWrites.some((w) => w.op === 'delete')).toBe(true)

    const insert = rankingWrites.find((w) => w.op === 'insert')
    expect(insert).toBeDefined()
    // Flattened, ranking-store row shape with the score value carried through.
    expect(insert.payload).toEqual([
      {
        judge_id: judgeId,
        contestant_id: 'c1',
        criteria_id: 'k1',
        round_id: 'r1',
        division_id: null,
        category_id: null,
        score: 85,
      },
    ])

    // ...and it still writes the session store (source of the live UI + locking).
    expect([...state.touched]).toContain('competition_session_judge_scores')
  })

  test('PHASE 3 FIX: a no-rounds session bridges with round_id NULL', async () => {
    // Session has no current round; submit falls back to event-wide criteria and
    // the bridge must use the null-safe delete branch and insert round_id: null.
    state = makeState({
      v_competition_active_session: [
        {
          data: {
            id: 'session-2',
            event_id: eventId,
            status: 'active',
            active_contestant_id: 'c1',
            current_contestant_order: 0,
            contestant_order: ['c1'],
            current_round_id: null,
          },
          error: null,
        },
      ],
      competition_session_judge_scores: [
        { data: null, error: null },
        { data: { id: 'sjs-2', is_locked: true }, error: null },
      ],
      // no round_criteria read (currentRoundId is null) -> event-wide fallback
      competition_criteria: [
        {
          data: [
            { id: 'k1', event_id: eventId, name: 'Technique', percentage: 100, min_score: 0, max_score: 100 },
          ],
          error: null,
        },
      ],
      competition_scores: [
        { data: null, error: null }, // delete
        { data: null, error: null }, // insert
      ],
    })

    await submitJudgeSessionScore(eventId, judgeId, { scores: { k1: 70 } })

    const insert = (state.writes['competition_scores'] ?? []).find((w) => w.op === 'insert')
    expect(insert).toBeDefined()
    expect(insert.payload[0]).toMatchObject({ round_id: null, score: 70, contestant_id: 'c1' })
  })
})
