// Phase 0 — Characterization tests (safety net before the Phase 4 ranking rework).
//
// These lock the CURRENT (as-coded) behavior of computeRankings that §8A / §7.2 /
// §7.3 of COMPETITION_FLEXIBLE_ARCHITECTURE_PLAN.md identify as defects. They are
// EXPECTED TO PASS TODAY. When Phase 4 changes the engine (per-round criteria,
// round_id separation, equal-rank ties), these assertions will intentionally
// change — update them in the same commit so the behavior delta is explicit and
// reviewable, never silent.
//
// Do NOT "fix" these to describe desired behavior. They describe today's behavior.

import { describe, test, expect } from 'vitest'
import { computeRankings } from '../../src/modules/scoring-engine.js'
import { CALCULATION_METHODS } from '../../src/utils/constants.js'

describe('characterization: rounds do NOT partition criteria (§8A / §7.2)', () => {
  const contestants = [{ id: 'c1', name: 'Alice', contestant_number: 1 }]
  const criteria = [
    { id: 'k1', name: 'Technique', percentage: 50 },
    { id: 'k2', name: 'Artistry', percentage: 50 },
  ]

  test('every round is computed over ALL criteria, so per-round values are identical', () => {
    // Intent a real competition would express: k1 belongs to the Prelim, k2 to
    // the Final. The engine has no round_criteria input, so BOTH rounds blend
    // BOTH criteria and therefore produce the SAME value. Phase 4 will make each
    // round honor only its own criteria and these two values will differ.
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 100 },
      { contestant_id: 'c1', criteria_id: 'k2', score: 0 },
    ]
    const rounds = [
      { id: 'r1', name: 'Preliminary', weight: 50 },
      { id: 'r2', name: 'Final', weight: 50 },
    ]
    const { rankings } = computeRankings({ scores, contestants, criteria, rounds })
    const row = rankings[0]

    // CURRENT behavior: both rounds collapse to the same blended value (50).
    expect(row.perRound.r1.value).toBe(50)
    expect(row.perRound.r2.value).toBe(50)
    expect(row.perRound.r1.value).toBe(row.perRound.r2.value)

    // ...and the final collapses to the single event-wide weighted-criteria score.
    expect(row.finalScore).toBe(50)
  })
})

describe('characterization: round_id is dropped when grouping scores (§8A)', () => {
  const contestants = [{ id: 'c1', name: 'Alice', contestant_number: 1 }]
  const criteria = [{ id: 'k1', name: 'Technique', percentage: 100 }]

  test('the same criterion scored in two different rounds is MERGED into one average', () => {
    // c1's k1 was scored 100 in round r1 and 0 in round r2. Grouping key is
    // contestant|criteria only (round_id ignored), so these merge to avg 50 with
    // judgeCount 2. Phase 4 keeps rounds separate so this will no longer merge.
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', round_id: 'r1', score: 100 },
      { contestant_id: 'c1', criteria_id: 'k1', round_id: 'r2', score: 0 },
    ]
    const { rankings } = computeRankings({ scores, contestants, criteria })
    const cell = rankings[0].perCriterion.k1
    expect(cell.average).toBe(50)
    expect(cell.judgeCount).toBe(2)
  })
})

describe('PHASE 4: equal-rank (standard competition ranking) for ties (§7.3)', () => {
  const criteria = [{ id: 'k1', name: 'Technique', percentage: 100 }]

  test('tied final scores share a rank (1, 1)', () => {
    const contestants = [
      { id: 'c1', name: 'Alice', contestant_number: 1 },
      { id: 'c2', name: 'Bob', contestant_number: 2 },
    ]
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 80 },
      { contestant_id: 'c2', criteria_id: 'k1', score: 80 },
    ]
    const { rankings } = computeRankings({ scores, contestants, criteria })
    expect(rankings[0].finalScore).toBe(80)
    expect(rankings[1].finalScore).toBe(80)
    // Was [1, 2] before Phase 4; equal-rank now shows the tie as [1, 1].
    expect(rankings.map((r) => r.rank)).toEqual([1, 1])
  })

  test('"1224" standard ranking: next distinct score resumes at its position', () => {
    const contestants = [
      { id: 'c1', name: 'A', contestant_number: 1 },
      { id: 'c2', name: 'B', contestant_number: 2 },
      { id: 'c3', name: 'C', contestant_number: 3 },
    ]
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 90 },
      { contestant_id: 'c2', criteria_id: 'k1', score: 90 },
      { contestant_id: 'c3', criteria_id: 'k1', score: 70 },
    ]
    const { rankings } = computeRankings({ scores, contestants, criteria })
    expect(rankings.map((r) => r.rank)).toEqual([1, 1, 3])
  })
})

describe('PHASE 7: configurable tie-breaker (§8B)', () => {
  const contestants = [
    { id: 'c1', name: 'A', contestant_number: 1 },
    { id: 'c2', name: 'B', contestant_number: 2 },
  ]
  const criteria = [
    { id: 'k1', name: 'Technique', percentage: 50 },
    { id: 'k2', name: 'Artistry', percentage: 50 },
  ]
  // Both average 80 overall, but c2 has a higher single criterion (100 vs 90).
  const scores = [
    { contestant_id: 'c1', criteria_id: 'k1', score: 90 },
    { contestant_id: 'c1', criteria_id: 'k2', score: 70 },
    { contestant_id: 'c2', criteria_id: 'k1', score: 100 },
    { contestant_id: 'c2', criteria_id: 'k2', score: 60 },
  ]

  test('default (no tie-breaker): equal final scores share a rank', () => {
    const { rankings } = computeRankings({ scores, contestants, criteria })
    expect(rankings.every((r) => r.finalScore === 80)).toBe(true)
    expect(rankings.map((r) => r.rank).sort()).toEqual([1, 1])
  })

  test('highest_criterion breaks the tie by best single criterion', () => {
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { tieBreaker: 'highest_criterion' },
    })
    expect(rankings[0].contestantId).toBe('c2') // 100 beats 90
    expect(rankings.map((r) => r.rank)).toEqual([1, 2])
    // tie-break scratch key must not leak into the public shape.
    expect(rankings[0]._tieKey).toBeUndefined()
  })
})

describe('characterization: drop-N reduction flows through computeRankings', () => {
  const contestants = [{ id: 'c1', name: 'Alice', contestant_number: 1 }]
  const criteria = [{ id: 'k1', name: 'Technique', percentage: 100 }]

  test('lowest_removal drops the single lowest judge score before averaging', () => {
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 10 },
      { contestant_id: 'c1', criteria_id: 'k1', score: 20 },
      { contestant_id: 'c1', criteria_id: 'k1', score: 30 },
    ]
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { calculationMethod: CALCULATION_METHODS.LOWEST_REMOVAL, dropLowest: 1 },
    })
    // sorted [10,20,30], drop lowest -> avg(20,30) = 25
    expect(rankings[0].finalScore).toBe(25)
  })
})

describe('PHASE 4 scoped mode: roundCriteria partitions criteria per round (§8A)', () => {
  const contestants = [{ id: 'c1', name: 'Alice', contestant_number: 1 }]
  const criteria = [
    { id: 'k1', name: 'Technique', percentage: 50 },
    { id: 'k2', name: 'Artistry', percentage: 50 },
  ]

  test('each round is scored using ONLY its own criteria, and round weights bite', () => {
    // r1 owns k1, r2 owns k2. Same fixture as the legacy test above, but now the
    // rounds differ (100 vs 0) instead of both collapsing to 50, and the final
    // reflects the round weights (70/30) rather than the flat 50.
    const rounds = [
      { id: 'r1', name: 'Preliminary', weight: 70 },
      { id: 'r2', name: 'Final', weight: 30 },
    ]
    const roundCriteria = { r1: ['k1'], r2: ['k2'] }
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', round_id: 'r1', score: 100 },
      { contestant_id: 'c1', criteria_id: 'k2', round_id: 'r2', score: 0 },
    ]
    const { rankings } = computeRankings({ scores, contestants, criteria, rounds, roundCriteria })
    const row = rankings[0]
    expect(row.perRound.r1.value).toBe(100)
    expect(row.perRound.r2.value).toBe(0)
    expect(row.perRound.r1.value).not.toBe(row.perRound.r2.value)
    expect(row.finalScore).toBe(70) // 100*0.7 + 0*0.3
  })

  test('the same criterion scored in two rounds is NOT merged (round_id kept)', () => {
    // k1 is used in both rounds; r1 sees 100, r2 sees 0. Unlike the legacy merge
    // (avg 50), each round keeps its own value.
    const rounds = [
      { id: 'r1', name: 'Preliminary', weight: 50 },
      { id: 'r2', name: 'Final', weight: 50 },
    ]
    const roundCriteria = { r1: ['k1'], r2: ['k1'] }
    const singleCriterion = [{ id: 'k1', name: 'Technique', percentage: 100 }]
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', round_id: 'r1', score: 100 },
      { contestant_id: 'c1', criteria_id: 'k1', round_id: 'r2', score: 0 },
    ]
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria: singleCriterion,
      rounds,
      roundCriteria,
    })
    const row = rankings[0]
    expect(row.perRound.r1.value).toBe(100)
    expect(row.perRound.r2.value).toBe(0)
    expect(row.finalScore).toBe(50) // 100*0.5 + 0*0.5
  })

  test('guard: rounds present but NO roundCriteria falls back to legacy (unchanged)', () => {
    const rounds = [
      { id: 'r1', name: 'Preliminary', weight: 50 },
      { id: 'r2', name: 'Final', weight: 50 },
    ]
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 100 },
      { contestant_id: 'c1', criteria_id: 'k2', score: 0 },
    ]
    // No roundCriteria -> legacy: both rounds collapse to 50.
    const { rankings } = computeRankings({ scores, contestants, criteria, rounds })
    expect(rankings[0].perRound.r1.value).toBe(50)
    expect(rankings[0].perRound.r2.value).toBe(50)
  })
})

describe('characterization: engine has NO division concept (division split is query-layer)', () => {
  // computeRankings takes no `divisions` argument. Any division field on a
  // contestant is ignored; contestants from different divisions are ranked in
  // ONE pool here. Real per-division isolation happens in getLiveRankings by
  // calling the engine once per division. This documents that boundary so a
  // future reader does not expect the pure engine to separate divisions.
  test('contestants carrying divisionId are ranked together, not separated', () => {
    const contestants = [
      { id: 'c1', name: 'Alice', contestant_number: 1, division_id: 'dA' },
      { id: 'c2', name: 'Bob', contestant_number: 2, division_id: 'dB' },
    ]
    const criteria = [{ id: 'k1', name: 'Technique', percentage: 100 }]
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 90 },
      { contestant_id: 'c2', criteria_id: 'k1', score: 95 },
    ]
    const { rankings } = computeRankings({ scores, contestants, criteria })
    expect(rankings).toHaveLength(2)
    // Bob (95) outranks Alice (90) despite being in a different division.
    expect(rankings[0].contestantId).toBe('c2')
    expect(rankings[0].rank).toBe(1)
  })
})
