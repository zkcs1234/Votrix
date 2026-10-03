import { describe, expect, test } from 'vitest'
import { applyDeductionsToRankings } from '../../src/modules/tabulation.js'
import { computeRankings } from '../../src/modules/scoring-engine.js'

describe('applyDeductionsToRankings', () => {
  test('keeps base scores intact and subtracts multiple active deductions', () => {
    const [winner, second] = applyDeductionsToRankings(
      [
        { contestantId: 'a', contestantName: 'A', finalScore: 92.33 },
        { contestantId: 'b', contestantName: 'B', finalScore: 91 },
      ],
      [
        { contestantId: 'a', amount: 2 },
        { contestantId: 'a', amount: 1 },
      ],
    )

    expect(winner).toMatchObject({ contestantId: 'b', baseScore: 91, deductionTotal: 0, finalScore: 91, rank: 1 })
    expect(second).toMatchObject({ contestantId: 'a', baseScore: 92.33, deductionTotal: 3, finalScore: 89.33, rank: 2 })
  })

  describe('Rank-Based tabulation', () => {
    test('converts each judge score order into placements and combines totals', () => {
      const { rankings } = computeRankings({
        contestants: [
          { id: 'a', name: 'A', contestant_number: 1 },
          { id: 'b', name: 'B', contestant_number: 2 },
          { id: 'c', name: 'C', contestant_number: 3 },
        ],
        scores: [
          { judge_id: 'j1', contestant_id: 'a', criteria_id: 'crit', score: 90 },
          { judge_id: 'j1', contestant_id: 'b', criteria_id: 'crit', score: 80 },
          { judge_id: 'j1', contestant_id: 'c', criteria_id: 'crit', score: 70 },
          { judge_id: 'j2', contestant_id: 'a', criteria_id: 'crit', score: 80 },
          { judge_id: 'j2', contestant_id: 'b', criteria_id: 'crit', score: 90 },
          { judge_id: 'j2', contestant_id: 'c', criteria_id: 'crit', score: 70 },
        ],
        criteria: [{ id: 'crit', name: 'Overall', percentage: 100 }],
        config: { calculationMethod: 'rank_based', decimalPlaces: 2 },
      })

      expect(rankings.map((row) => row.contestantId)).toEqual(['a', 'b', 'c'])
      expect(rankings.map((row) => row.placementTotal)).toEqual([3, 3, 6])
      expect(rankings.map((row) => row.rank)).toEqual([1, 1, 3])
    })

    test('applies deductions as placement penalties', () => {
      const [winner, second] = applyDeductionsToRankings(
        [
          { contestantId: 'a', placementTotal: 3 },
          { contestantId: 'b', placementTotal: 4 },
        ],
        [{ contestantId: 'a', amount: 2 }],
      )

      expect(winner).toMatchObject({ contestantId: 'b', baseScore: 4, finalScore: 4, rank: 1 })
      expect(second).toMatchObject({ contestantId: 'a', baseScore: 3, finalScore: 5, rank: 2 })
    })
  })

  test('ignores deductions from another round', () => {
    const [row] = applyDeductionsToRankings(
      [{ contestantId: 'a', finalScore: 90 }],
      [{ contestantId: 'a', amount: 4, roundId: 'round-2' }],
      'round-1',
    )

    expect(row).toMatchObject({ baseScore: 90, deductionTotal: 0, finalScore: 90 })
  })

  test('assigns shared ranks after deductions create a tie', () => {
    const rows = applyDeductionsToRankings(
      [
        { contestantId: 'a', finalScore: 92 },
        { contestantId: 'b', finalScore: 90 },
      ],
      [{ contestantId: 'a', amount: 2 }],
    )

    expect(rows.map((row) => row.rank)).toEqual([1, 1])
  })
})
