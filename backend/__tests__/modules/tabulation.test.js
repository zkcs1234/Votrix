import { describe, expect, test } from 'vitest'
import { applyDeductionsToRankings } from '../../src/modules/tabulation.js'

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
