import { expect, test } from 'vitest'
import { tabulationDeductionReport } from './tabulationDeductionReport'

const source = () => ({ sourceDigest: 'digest', session: { round_id: null }, rules: { configuration_snapshot: { structure: 'single', rounds: [], criteria: [{ id: 'criterion', name: 'Performance' }], scoringConfig: { deductionMode: 'judge', deductionRules: [{ id: 'late', description: 'Late start', amount: 2, units: 'points', appliedBy: 'judge' }] } } }, entries: [{ id: 'entry', name: 'Performer', contestantNumber: 1 }], progress: [{ judgeId: 'judge', judgeName: 'Judge One' }], calculation: { output_snapshot: { worksheets: [{ entryId: 'entry', judgeId: 'judge', roundId: null, originalTotal: 90, total: 88, judgeDeductionTotal: 2, criteria: [{ name: 'Performance', originalContribution: 90, contribution: 90, average: 90, percentage: 100 }] }] } }, judgeDeductions: [{ id: 'deduction', contestant_id: 'entry', judge_id: 'judge', round_id: null, description: 'Late start', amount: 2, units: 'points', offense_key: 'time-1', reason: 'Exceeded permitted time', submission_id: 'submission' }] })
test('vertical reports keep each original judge row, its trace and deduction together', () => {
  const rows = tabulationDeductionReport([{ 'Record type': 'Original scores', 'Entry number': 1, Entry: 'Performer', Judge: 'Judge One', Performance: 90 }, { 'Record type': 'Calculated result', Entry: 'Performer' }], source(), null)
  expect(rows.map(row => row['Record type'])).toEqual(['Original scores', 'Criterion calculation', 'Judge deduction', 'Calculated result'])
  expect(rows[0]).toMatchObject({ Performance: 90, 'Original judge total': 90, 'Adjusted judge total': 88 })
  expect(rows[2]).toMatchObject({ 'Deduction owner': 'Judge', 'Deduction amount': 2, 'Violation reference': 'time-1', 'Deduction reason': 'Exceeded permitted time' })
})
test('disabled reports omit every deduction-specific column', () => {
  const state = source(); state.rules.configuration_snapshot.scoringConfig = { deductionMode: 'none', deductionRules: [] }
  expect(tabulationDeductionReport([{ Entry: 'Performer', 'Approved deductions': 0, 'Deduction reason': '', Score: 90 }], state, null)).toEqual([{ Entry: 'Performer', Score: 90 }])
})
test('an uncalculated judge sheet exports the submitted deduction without inventing adjusted totals', () => {
  const state = source(); state.calculation = null
  const rows = tabulationDeductionReport([{ 'Record type': 'Original scores', 'Entry number': 1, Entry: 'Performer', Judge: 'Judge One', Performance: 90 }], state, null)
  expect(rows[0]['Adjusted judge total']).toBe('')
  expect(rows.find(row => row['Record type'] === 'Judge deduction')['Deduction amount']).toBe(2)
})
