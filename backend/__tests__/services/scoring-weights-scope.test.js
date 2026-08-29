// Phase 4 (§8A) — scope-aware criteria-weight validation in
// competition.service#assertScoringWeightsValid.
//
// Locks the new behavior: when an event uses per-round criteria, each round's
// assigned criteria must total 100% WITHIN that round; otherwise the legacy flat
// event-wide 100% rule applies (feature-guarded, so existing events are
// unaffected).

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '../../src/utils/ApiError.js'

let state

function makeState(responses) {
  return { responses, idx: {} }
}

function fromImpl(table) {
  if (!(table in state.idx)) state.idx[table] = 0
  const resolveNext = () => {
    const list = state.responses[table] || []
    const r = list[state.idx[table]] ?? { data: [], error: null }
    state.idx[table] += 1
    return r
  }
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    then: (onF, onR) => Promise.resolve(resolveNext()).then(onF, onR),
  }
  return chain
}

vi.mock('../../src/foundation/index.js', () => ({
  db: vi.fn(() => ({ from: fromImpl })),
}))

vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'evt', event_type: 'competition_scoring' })),
}))

vi.mock('../../src/services/competition-division.service.js', () => ({
  listDivisions: vi.fn(async () => []),
}))

let assertScoringWeightsValid

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import('../../src/services/competition.service.js')
  assertScoringWeightsValid = mod.assertScoringWeightsValid
})

describe('assertScoringWeightsValid — scope-aware criteria (§8A)', () => {
  test('scoped: rejects a round whose criteria do not total 100%', async () => {
    state = makeState({
      competition_categories: [{ data: [], error: null }],
      competition_rounds: [
        {
          data: [
            { id: 'r1', name: 'Preliminary', weight: 50 },
            { id: 'r2', name: 'Final', weight: 50 },
          ],
          error: null,
        },
      ],
      competition_criteria: [
        {
          data: [
            { id: 'k1', name: 'A', percentage: 60 },
            { id: 'k2', name: 'B', percentage: 40 },
            { id: 'k3', name: 'C', percentage: 50 },
            { id: 'k4', name: 'D', percentage: 40 },
          ],
          error: null,
        },
      ],
      competition_round_criteria: [
        {
          data: [
            { round_id: 'r1', criteria_id: 'k1' }, // r1 = 60+40 = 100 (ok)
            { round_id: 'r1', criteria_id: 'k2' },
            { round_id: 'r2', criteria_id: 'k3' }, // r2 = 50+40 = 90 (reject)
            { round_id: 'r2', criteria_id: 'k4' },
          ],
          error: null,
        },
      ],
    })

    await expect(assertScoringWeightsValid('evt', 'org')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Criteria weights for "Final" must total 100% (currently 90%)',
    })
  })

  test('scoped: passes when every round totals 100%', async () => {
    state = makeState({
      competition_categories: [{ data: [], error: null }],
      competition_rounds: [
        {
          data: [
            { id: 'r1', name: 'Preliminary', weight: 50 },
            { id: 'r2', name: 'Final', weight: 50 },
          ],
          error: null,
        },
      ],
      competition_criteria: [
        {
          data: [
            { id: 'k1', name: 'A', percentage: 100 },
            { id: 'k2', name: 'B', percentage: 100 },
          ],
          error: null,
        },
      ],
      competition_round_criteria: [
        {
          data: [
            { round_id: 'r1', criteria_id: 'k1' },
            { round_id: 'r2', criteria_id: 'k2' },
          ],
          error: null,
        },
      ],
    })

    await expect(assertScoringWeightsValid('evt', 'org')).resolves.toBeUndefined()
  })

  test('flat fallback: no round_criteria uses the legacy event-wide rule', async () => {
    state = makeState({
      competition_categories: [{ data: [], error: null }],
      competition_rounds: [{ data: [], error: null }], // no rounds -> flat
      competition_criteria: [
        {
          data: [
            { id: 'k1', name: 'A', percentage: 50 },
            { id: 'k2', name: 'B', percentage: 35 },
          ],
          error: null,
        },
      ],
    })

    await expect(assertScoringWeightsValid('evt', 'org')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Criteria weights must total 100% (currently 85%)',
    })
  })
})
