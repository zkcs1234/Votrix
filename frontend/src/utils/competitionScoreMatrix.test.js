import { describe, expect, test } from 'vitest'
import { buildScoreMatrix } from './competitionScoreMatrix'

function sources(overrides = {}) {
  return {
    complete: true,
    rules: { configuration_snapshot: { scoringConfig: { calculationMethod: 'weighted_average' }, rounds: [] } },
    session: { entry_ids: ['e1', 'e2', 'e3'] },
    entries: [
      { id: 'e1', name: 'Ana', contestantNumber: 1 },
      { id: 'e2', name: 'Ben', contestantNumber: 2 },
      { id: 'e3', name: 'Cy', contestantNumber: 3 },
    ],
    progress: [
      { judgeId: 'j1', judgeName: 'Judge One', submitted: true },
      { judgeId: 'j2', judgeName: 'Judge One', submitted: true },
      { judgeId: 'j3', judgeName: 'Pending', submitted: false },
    ],
    calculation: {
      finalized: false,
      output_snapshot: {
        results: [
          { contestantId: 'e1', rank: 2, baseScore: 85, finalScore: 85 },
          { contestantId: 'e2', rank: 1, baseScore: 90, finalScore: 90 },
          { contestantId: 'e3', rank: 3, baseScore: 70, finalScore: 70 },
        ],
        worksheets: [
          { entryId: 'e1', judgeId: 'j1', roundId: null, total: 80 },
          { entryId: 'e1', judgeId: 'j2', roundId: null, total: 90 },
          { entryId: 'e2', judgeId: 'j1', roundId: null, total: 95 },
          { entryId: 'e2', judgeId: 'j2', roundId: null, total: 85 },
        ],
      },
    },
    ...overrides,
  }
}

describe('score matrix', () => {
  test('one row per entry, ranked, with one column per submitted judge', () => {
    const matrix = buildScoreMatrix(sources(), { roundId: null })
    expect(matrix.headers).toEqual(['Rank', 'No.', 'Entry', 'Judge One', 'Judge One (2)', 'Aggregate score', 'Final score', 'Status'])
    expect(matrix.rows.map((row) => row[2])).toEqual(['Ben', 'Ana', 'Cy'])
    expect(matrix.records[0]).toMatchObject({ Rank: 1, Entry: 'Ben', 'Judge One': 95, 'Judge One (2)': 85, 'Final score': 90 })
    // An entry with no judge total yet keeps an empty cell rather than a false zero.
    expect(matrix.records[2]['Judge One']).toBe('')
  })

  test('labels results that are not finalized as such', () => {
    expect(buildScoreMatrix(sources(), { roundId: null }).status).toBe('Calculated, not finalized')
    const finalized = sources()
    finalized.calculation.finalized = true
    expect(buildScoreMatrix(finalized, { roundId: null }).status).toBe('Official')
  })

  test('adds a deductions column only when some entry has one', () => {
    const withDeduction = sources()
    withDeduction.calculation.output_snapshot.results[0].deductionTotal = 2
    expect(buildScoreMatrix(withDeduction, { roundId: null }).headers).toContain('Deductions')
    expect(buildScoreMatrix(sources(), { roundId: null }).headers).not.toContain('Deductions')
  })

  test('uses placement wording for rank-based rounds', () => {
    const ranked = sources()
    ranked.rules.configuration_snapshot.scoringConfig.calculationMethod = 'rank_based'
    expect(buildScoreMatrix(ranked, { roundId: null }).headers).toContain('Placement total')
  })

  test('adds a division column for division rankings', () => {
    const divided = sources()
    divided.calculation.output_snapshot.divisionRanking = { mode: 'division' }
    divided.calculation.output_snapshot.results[1].divisionName = 'Male'
    const matrix = buildScoreMatrix(divided, { roundId: null })
    expect(matrix.headers[3]).toBe('Division')
    expect(matrix.records[0].Division).toBe('Male')
  })

  test('refuses to export before sources are complete or results are calculated', () => {
    expect(() => buildScoreMatrix(sources({ complete: false }), { roundId: null })).toThrow('Complete current judge sheets')
    expect(() => buildScoreMatrix(sources({ calculation: null }), { roundId: null })).toThrow('Calculate the results')
  })
})
