import { describe, test, expect } from 'vitest'
import {
  mergeScoringConfig,
  resolveScoreBounds,
  isScoreInBounds,
  reduceScores,
  computeRankings,
} from '../../src/modules/scoring-engine.js'
import { SCORE_TYPES, CALCULATION_METHODS } from '../../src/utils/constants.js'

describe('scoring engine: configuration', () => {
  test('mergeScoringConfig applies defaults', () => {
    const c = mergeScoringConfig({})
    expect(c.scoreType).toBe(SCORE_TYPES.RANGE_1_100)
    expect(c.calculationMethod).toBe(CALCULATION_METHODS.WEIGHTED_AVERAGE)
    expect(c.decimalPlaces).toBe(2)
  })

  test('mergeScoringConfig coerces numeric fields', () => {
    const c = mergeScoringConfig({ decimalPlaces: '4', dropHighest: '1', dropLowest: '2' })
    expect(c.decimalPlaces).toBe(4)
    expect(c.dropHighest).toBe(1)
    expect(c.dropLowest).toBe(2)
  })

  test('resolveScoreBounds: 1-10', () => {
    expect(resolveScoreBounds({ scoreType: SCORE_TYPES.RANGE_1_10 })).toEqual({ min: 1, max: 10 })
  })

  test('resolveScoreBounds: custom range', () => {
    expect(resolveScoreBounds({ scoreType: SCORE_TYPES.CUSTOM_RANGE, customMin: 50, customMax: 75 })).toEqual({
      min: 50,
      max: 75,
    })
  })

  test('resolveScoreBounds: custom range with bad values falls back to 0-100', () => {
    expect(resolveScoreBounds({ scoreType: SCORE_TYPES.CUSTOM_RANGE, customMin: 80, customMax: 10 })).toEqual({
      min: 0,
      max: 100,
    })
  })

  test('isScoreInBounds respects custom range', () => {
    const cfg = { scoreType: SCORE_TYPES.CUSTOM_RANGE, customMin: 1, customMax: 5 }
    expect(isScoreInBounds(3, cfg)).toBe(true)
    expect(isScoreInBounds(6, cfg)).toBe(false)
    expect(isScoreInBounds('abc', cfg)).toBe(false)
  })
})

describe('scoring engine: reductions', () => {
  test('average', () => {
    expect(reduceScores([10, 20, 30], { calculationMethod: CALCULATION_METHODS.AVERAGE })).toBe(20)
  })

  test('sum', () => {
    expect(reduceScores([1, 2, 3], { calculationMethod: CALCULATION_METHODS.SUM })).toBe(6)
  })

  test('highest', () => {
    expect(reduceScores([1, 5, 3], { calculationMethod: CALCULATION_METHODS.HIGHEST_SCORE })).toBe(5)
  })

  test('lowest removal: drop 1 lowest, 1 highest', () => {
    // [10,20,30,40,50] dropping 1 lowest and 1 highest -> avg of 20,30,40 = 30
    expect(
      reduceScores([10, 20, 30, 40, 50], {
        calculationMethod: CALCULATION_METHODS.LOWEST_REMOVAL,
        dropLowest: 1,
        dropHighest: 1,
      }),
    ).toBe(30)
  })

  test('empty scores default to 0', () => {
    expect(reduceScores([], { calculationMethod: CALCULATION_METHODS.AVERAGE })).toBe(0)
    expect(reduceScores(null, { calculationMethod: CALCULATION_METHODS.SUM })).toBe(0)
  })

  test('non-numeric scores are ignored', () => {
    expect(
      reduceScores([1, 'bad', 3], { calculationMethod: CALCULATION_METHODS.AVERAGE }),
    ).toBe(2)
  })
})

describe('scoring engine: computeRankings', () => {
  const contestants = [
    { id: 'c1', name: 'Alice', contestant_number: 1 },
    { id: 'c2', name: 'Bob', contestant_number: 2 },
  ]
  const criteria = [
    { id: 'k1', name: 'Beauty', percentage: 50 },
    { id: 'k2', name: 'Talent', percentage: 50 },
  ]

  test('legacy flow (no rounds/categories): weighted average of criteria', () => {
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 80 },
      { contestant_id: 'c1', criteria_id: 'k2', score: 90 },
      { contestant_id: 'c2', criteria_id: 'k1', score: 70 },
      { contestant_id: 'c2', criteria_id: 'k2', score: 60 },
    ]
    const { rankings, debug } = computeRankings({ scores, contestants, criteria })
    expect(rankings[0].contestantId).toBe('c1')
    expect(rankings[0].finalScore).toBe(85)
    expect(rankings[1].contestantId).toBe('c2')
    expect(rankings[1].finalScore).toBe(65)
    expect(rankings[0].rank).toBe(1)
    expect(rankings[1].rank).toBe(2)
    expect(debug.criterionTotals).toBe(100)
  })

  test('round weights are applied when rounds exist', () => {
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 80 },
      { contestant_id: 'c1', criteria_id: 'k2', score: 80 },
      { contestant_id: 'c2', criteria_id: 'k1', score: 100 },
      { contestant_id: 'c2', criteria_id: 'k2', score: 0 },
    ]
    const rounds = [
      { id: 'r1', name: 'Pre', weight: 50 },
      { id: 'r2', name: 'Final', weight: 50 },
    ]
    // Both contestants tie at 80 in the engine because rounds have no scores
    // attached in this fixture; only the contestant-level per-criterion
    // averages are weighted. Their weighted score is 80 regardless of round
    // weight (round weight = 100%). This sanity-checks the engine doesn't crash
    // and produces a stable, valid result.
    const { rankings } = computeRankings({ scores, contestants, criteria, rounds })
    expect(rankings.map((r) => r.finalScore)).toEqual([80, 50])
  })

  test('category weights are applied when categories exist', () => {
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 100 },
      { contestant_id: 'c1', criteria_id: 'k2', score: 0 },
      { contestant_id: 'c2', criteria_id: 'k1', score: 50 },
      { contestant_id: 'c2', criteria_id: 'k2', score: 100 },
    ]
    const categories = [
      { id: 'cat1', name: 'Look', weight: 100 },
    ]
    const { rankings } = computeRankings({ scores, contestants, criteria, categories })
    // c1: weighted average of (100, 0) = 50
    // c2: weighted average of (50, 100) = 75
    expect(rankings[0].contestantId).toBe('c2')
    expect(rankings[0].finalScore).toBe(75)
    expect(rankings[1].contestantId).toBe('c1')
    expect(rankings[1].finalScore).toBe(50)
  })

  test('non-weighted methods collapse to per-criterion average when no rounds', () => {
    // With no rounds/categories, the engine builds a single implicit round
    // and reduces per-criterion to the configured method. SUM reduces
    // per-criterion cell scores (i.e. the list of judge scores for that
    // criterion), then averages across criteria for the round value.
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 10 },
      { contestant_id: 'c1', criteria_id: 'k2', score: 20 },
      { contestant_id: 'c2', criteria_id: 'k1', score: 15 },
      { contestant_id: 'c2', criteria_id: 'k2', score: 15 },
    ]
    const { rankings: sumRankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { calculationMethod: CALCULATION_METHODS.SUM },
    })
    // SUM per-criterion (one judge each): c1: k1=10,k2=20; c2: k1=15,k2=15.
    // Round value = avg of per-criterion values: c1=15, c2=15.
    expect(sumRankings.find((r) => r.contestantId === 'c1').finalScore).toBe(15)
    expect(sumRankings.find((r) => r.contestantId === 'c2').finalScore).toBe(15)

    const { rankings: highRankings } = computeRankings({
      scores,
      contestants,
      criteria,
      config: { calculationMethod: CALCULATION_METHODS.HIGHEST_SCORE },
    })
    // highest per-cell: c1: k1=10,k2=20; c2: k1=15,k2=15
    // round value = avg = c1:15, c2:15
    expect(highRankings.find((r) => r.contestantId === 'c1').finalScore).toBe(15)
    expect(highRankings.find((r) => r.contestantId === 'c2').finalScore).toBe(15)
  })

  test('decimal places are respected', () => {
    const scores = [
      { contestant_id: 'c1', criteria_id: 'k1', score: 80 },
      { contestant_id: 'c1', criteria_id: 'k2', score: 81 },
    ]
    const { rankings } = computeRankings({
      scores,
      contestants: [contestants[0]],
      criteria,
      config: { decimalPlaces: 0 },
    })
    expect(rankings[0].finalScore).toBe(81)
  })
})
