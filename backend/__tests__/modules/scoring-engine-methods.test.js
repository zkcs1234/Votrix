import { describe, test, expect } from 'vitest'
import { computeRankings } from '../../src/modules/scoring-engine.js'
import { CALCULATION_METHODS, TIE_BREAKERS } from '../../src/utils/constants.js'

// Coverage for the scoring methods and tie-breaks added alongside the guided
// Structure & Scoring flow: judge weighting, percentile normalization,
// rank-based placement, and the expanded tie-break strategies.

describe('judge weighting', () => {
  const contestants = [{ id: 'c1', name: 'Alice', contestant_number: 1 }]
  const criteria = [{ id: 'k1', name: 'Overall', percentage: 100 }]
  const scores = [
    { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k1', score: 100 },
    { judge_id: 'j2', contestant_id: 'c1', criteria_id: 'k1', score: 50 },
  ]

  test('absent weights leave every judge equal', () => {
    const { rankings } = computeRankings({ scores, contestants, criteria })
    expect(rankings[0].finalScore).toBe(75)
  })

  test('an empty weight map is treated as unweighted', () => {
    const { rankings } = computeRankings({ scores, contestants, criteria, judgeWeights: {} })
    expect(rankings[0].finalScore).toBe(75)
  })

  test('a head judge weighted 75/25 pulls the average toward their score', () => {
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      judgeWeights: { j1: 75, j2: 25 },
    })
    // (100 x 75 + 50 x 25) / 100
    expect(rankings[0].finalScore).toBe(87.5)
  })

  test('judges with no weight configured fall back to a plain mean', () => {
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      judgeWeights: { someoneElse: 100 },
    })
    expect(rankings[0].finalScore).toBe(75)
  })

  test('SUM ignores judge weights — scaling a total is not a fairness knob', () => {
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { calculationMethod: CALCULATION_METHODS.SUM },
      judgeWeights: { j1: 90, j2: 10 },
    })
    expect(rankings[0].finalScore).toBe(150)
  })

  test('LOWEST_REMOVAL trims first, then weights the survivors', () => {
    const threeJudges = [
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k1', score: 10 },
      { judge_id: 'j2', contestant_id: 'c1', criteria_id: 'k1', score: 60 },
      { judge_id: 'j3', contestant_id: 'c1', criteria_id: 'k1', score: 80 },
    ]
    const { rankings } = computeRankings({
      scores: threeJudges,
      contestants,
      criteria,
      config: { calculationMethod: CALCULATION_METHODS.LOWEST_REMOVAL, dropLowest: 1, dropHighest: 0 },
      judgeWeights: { j1: 50, j2: 25, j3: 75 },
    })
    // j1 (the 10) is dropped; remaining (60 x 25 + 80 x 75) / 100
    expect(rankings[0].finalScore).toBe(75)
  })
})

describe('percentile normalization', () => {
  const contestants = [
    { id: 'c1', name: 'Alice', contestant_number: 1 },
    { id: 'c2', name: 'Bob', contestant_number: 2 },
  ]
  const criteria = [{ id: 'k1', name: 'Overall', percentage: 100 }]
  // A generous judge (90s) prefers Alice; a harsh judge (50s) prefers Bob.
  const scores = [
    { judge_id: 'generous', contestant_id: 'c1', criteria_id: 'k1', score: 95 },
    { judge_id: 'generous', contestant_id: 'c2', criteria_id: 'k1', score: 90 },
    { judge_id: 'harsh', contestant_id: 'c1', criteria_id: 'k1', score: 50 },
    { judge_id: 'harsh', contestant_id: 'c2', criteria_id: 'k1', score: 60 },
  ]

  test('raw averaging lets the generous judge decide the winner', () => {
    const { rankings } = computeRankings({ scores, contestants, criteria })
    expect(rankings[0].contestantId).toBe('c2')
    expect(rankings[0].finalScore).toBe(75)
    expect(rankings[1].finalScore).toBe(72.5)
  })

  test('percentile rescales each judge onto their own spread, so one vote each ties', () => {
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { calculationMethod: CALCULATION_METHODS.PERCENTILE },
    })
    expect(rankings[0].finalScore).toBe(50)
    expect(rankings[1].finalScore).toBe(50)
    expect(rankings[0].rank).toBe(1)
    expect(rankings[1].rank).toBe(1)
  })

  test('a judge who submitted a single score has no spread to correct for', () => {
    const { rankings } = computeRankings({
      scores: [{ judge_id: 'only', contestant_id: 'c1', criteria_id: 'k1', score: 93 }],
      contestants: [contestants[0]],
      criteria,
      config: { calculationMethod: CALCULATION_METHODS.PERCENTILE },
    })
    expect(rankings[0].finalScore).toBe(50)
  })
})

describe('rank-based scoring', () => {
  const contestants = [
    { id: 'c1', name: 'Alice', contestant_number: 1 },
    { id: 'c2', name: 'Bob', contestant_number: 2 },
    { id: 'c3', name: 'Cara', contestant_number: 3 },
  ]
  const criteria = [{ id: 'k1', name: 'Overall', percentage: 100 }]
  // Judge A ranks c1 > c2 > c3 but by hairline margins.
  // Judge B ranks c2 > c3 > c1 and buries c1 with a 10.
  const scores = [
    { judge_id: 'jA', contestant_id: 'c1', criteria_id: 'k1', score: 100 },
    { judge_id: 'jA', contestant_id: 'c2', criteria_id: 'k1', score: 99 },
    { judge_id: 'jA', contestant_id: 'c3', criteria_id: 'k1', score: 98 },
    { judge_id: 'jB', contestant_id: 'c1', criteria_id: 'k1', score: 10 },
    { judge_id: 'jB', contestant_id: 'c2', criteria_id: 'k1', score: 90 },
    { judge_id: 'jB', contestant_id: 'c3', criteria_id: 'k1', score: 80 },
  ]

  test('raw averaging lets one judge sink a contestant with a single low score', () => {
    const { rankings } = computeRankings({ scores, contestants, criteria })
    expect(rankings.map((r) => r.contestantId)).toEqual(['c2', 'c3', 'c1'])
  })

  test('rank-based counts placements, so magnitude stops dominating', () => {
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { calculationMethod: CALCULATION_METHODS.RANK_BASED },
    })
    // 1st = 100, last = 0. c1: 100 & 0 -> 50. c2: 50 & 100 -> 75. c3: 0 & 50 -> 25.
    expect(rankings.map((r) => r.contestantId)).toEqual(['c2', 'c1', 'c3'])
    expect(rankings.map((r) => r.finalScore)).toEqual([75, 50, 25])
  })

  test('contestants a judge scored identically share a placement', () => {
    const tied = [
      { judge_id: 'jA', contestant_id: 'c1', criteria_id: 'k1', score: 90 },
      { judge_id: 'jA', contestant_id: 'c2', criteria_id: 'k1', score: 90 },
      { judge_id: 'jA', contestant_id: 'c3', criteria_id: 'k1', score: 50 },
    ]
    const { rankings } = computeRankings({
      scores: tied,
      contestants,
      criteria,
      config: { calculationMethod: CALCULATION_METHODS.RANK_BASED },
    })
    const byId = Object.fromEntries(rankings.map((r) => [r.contestantId, r.finalScore]))
    // c1 and c2 share midrank 1.5 -> (3 - 1.5) / 2 x 100 = 75
    expect(byId.c1).toBe(75)
    expect(byId.c2).toBe(75)
    expect(byId.c3).toBe(0)
  })
})

describe('tie-break strategies', () => {
  test('highest_criterion: the better single criterion wins', () => {
    const contestants = [
      { id: 'c1', name: 'Alice', contestant_number: 1 },
      { id: 'c2', name: 'Bob', contestant_number: 2 },
    ]
    const criteria = [
      { id: 'k1', name: 'Gown', percentage: 50 },
      { id: 'k2', name: 'Q&A', percentage: 50 },
    ]
    const scores = [
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k1', score: 100 },
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k2', score: 60 },
      { judge_id: 'j1', contestant_id: 'c2', criteria_id: 'k1', score: 80 },
      { judge_id: 'j1', contestant_id: 'c2', criteria_id: 'k2', score: 80 },
    ]
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { tieBreaker: TIE_BREAKERS.HIGHEST_CRITERION },
    })
    expect(rankings[0].finalScore).toBe(80)
    expect(rankings[1].finalScore).toBe(80)
    expect(rankings[0].contestantId).toBe('c1')
    expect(rankings[0].rank).toBe(1)
    expect(rankings[1].rank).toBe(2)
  })

  test('countback: whoever won more individual criteria takes the tie', () => {
    const contestants = [
      { id: 'c1', name: 'Alice', contestant_number: 1 },
      { id: 'c2', name: 'Bob', contestant_number: 2 },
    ]
    const criteria = [
      { id: 'k1', name: 'Gown', percentage: 50 },
      { id: 'k2', name: 'Talent', percentage: 25 },
      { id: 'k3', name: 'Q&A', percentage: 25 },
    ]
    // Both finish on 77.5, but Alice wins two of the three criteria.
    const scores = [
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k1', score: 60 },
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k2', score: 95 },
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k3', score: 95 },
      { judge_id: 'j1', contestant_id: 'c2', criteria_id: 'k1', score: 95 },
      { judge_id: 'j1', contestant_id: 'c2', criteria_id: 'k2', score: 60 },
      { judge_id: 'j1', contestant_id: 'c2', criteria_id: 'k3', score: 60 },
    ]
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { tieBreaker: TIE_BREAKERS.COUNTBACK },
    })
    expect(rankings[0].finalScore).toBe(77.5)
    expect(rankings[1].finalScore).toBe(77.5)
    expect(rankings[0].contestantId).toBe('c1')
    expect(rankings[1].rank).toBe(2)
  })

  test('highest_round: a nominated round decides it', () => {
    const contestants = [
      { id: 'c1', name: 'Alice', contestant_number: 1 },
      { id: 'c2', name: 'Bob', contestant_number: 2 },
    ]
    const criteria = [
      { id: 'k1', name: 'Gown', percentage: 100 },
      { id: 'k2', name: 'Q&A', percentage: 100 },
    ]
    const rounds = [
      { id: 'r1', name: 'Gown', weight: 50 },
      { id: 'r2', name: 'Q&A', weight: 50 },
    ]
    const roundCriteria = { r1: ['k1'], r2: ['k2'] }
    const scores = [
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k1', round_id: 'r1', score: 90 },
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k2', round_id: 'r2', score: 70 },
      { judge_id: 'j1', contestant_id: 'c2', criteria_id: 'k1', round_id: 'r1', score: 70 },
      { judge_id: 'j1', contestant_id: 'c2', criteria_id: 'k2', round_id: 'r2', score: 90 },
    ]
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      rounds,
      roundCriteria,
      config: { tieBreaker: TIE_BREAKERS.HIGHEST_ROUND, tieBreakerRoundId: 'r2' },
    })
    expect(rankings[0].finalScore).toBe(80)
    expect(rankings[1].finalScore).toBe(80)
    // Bob took the Q&A round 90-70.
    expect(rankings[0].contestantId).toBe('c2')
    expect(rankings[1].rank).toBe(2)
  })

  test('judges_majority: the contestant more judges scored higher wins', () => {
    const contestants = [
      { id: 'c1', name: 'Alice', contestant_number: 1 },
      { id: 'c2', name: 'Bob', contestant_number: 2 },
    ]
    const criteria = [{ id: 'k1', name: 'Overall', percentage: 100 }]
    // Both average 80, but two of three judges put Alice ahead.
    const scores = [
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k1', score: 90 },
      { judge_id: 'j2', contestant_id: 'c1', criteria_id: 'k1', score: 85 },
      { judge_id: 'j3', contestant_id: 'c1', criteria_id: 'k1', score: 65 },
      { judge_id: 'j1', contestant_id: 'c2', criteria_id: 'k1', score: 80 },
      { judge_id: 'j2', contestant_id: 'c2', criteria_id: 'k1', score: 80 },
      { judge_id: 'j3', contestant_id: 'c2', criteria_id: 'k1', score: 80 },
    ]
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { tieBreaker: TIE_BREAKERS.JUDGES_MAJORITY },
    })
    expect(rankings[0].finalScore).toBe(80)
    expect(rankings[1].finalScore).toBe(80)
    expect(rankings[0].contestantId).toBe('c1')
    expect(rankings[1].rank).toBe(2)
  })

  test('manual leaves the tie standing for the organizer to call', () => {
    const contestants = [
      { id: 'c1', name: 'Alice', contestant_number: 1 },
      { id: 'c2', name: 'Bob', contestant_number: 2 },
    ]
    const criteria = [{ id: 'k1', name: 'Overall', percentage: 100 }]
    const scores = [
      { judge_id: 'j1', contestant_id: 'c1', criteria_id: 'k1', score: 80 },
      { judge_id: 'j1', contestant_id: 'c2', criteria_id: 'k1', score: 80 },
    ]
    const { rankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { tieBreaker: TIE_BREAKERS.MANUAL },
    })
    expect(rankings[0].rank).toBe(1)
    expect(rankings[1].rank).toBe(1)
  })
})
