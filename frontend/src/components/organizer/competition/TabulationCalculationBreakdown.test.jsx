import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import Breakdown from './TabulationCalculationBreakdown'

function props() {
  return {
    entry: { id: 'entry', name: 'Team' }, roundId: 'final', roundName: 'Final', onClose: vi.fn(),
    configuration: {
      structure: 'multiple', rounds: [{ id: 'pre', name: 'Preliminary', progression: 'weighted', weight: 20 }, { id: 'final', name: 'Final', progression: 'weighted', weight: 80 }],
      scoringConfig: { calculationMethod: 'weighted_average', decimalPlaces: 2 },
      criteria: [{ id: 'technique', roundId: 'final', name: 'Technique', percentage: 100, minorCriteria: [{ id: 'skill', name: 'Skill', minScore: 1, maxScore: 10 }] }],
    },
    progress: [{ judgeId: 'judge1', judgeName: 'Judge One' }, { judgeId: 'judge2', judgeName: 'Judge Two' }],
    calculation: { finalized: false, output_snapshot: {
      worksheets: [
        { entryId: 'entry', roundId: 'pre', judgeId: 'judge1', total: 17, criteria: [] },
        ...[['judge1', 80, 8], ['judge2', 90, 9]].map(([judgeId, total, raw]) => ({ entryId: 'entry', roundId: 'final', judgeId, total, criteria: [{ criteriaId: 'technique', name: 'Technique', percentage: 100, average: total, contribution: total, minors: [{ id: 'skill', raw, normalized: total }] }] })),
      ],
      results: [{ contestantId: 'entry', baseScore: 82, finalScore: 80, deductionTotal: 2, rank: 1, perRound: { pre: { value: 70 }, final: { value: 85 } } }],
      entryCriteriaAverages: { 'final:entry': { criteria: { technique: 85 } } },
    } },
  }
}

test('judge tabs display current-round backend contributions instead of sibling-round traces', () => {
  render(<Breakdown {...props()}/> )
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getAllByRole('tab')).toHaveLength(3)
  expect(dialog.getByText('Skill: 8')).toBeInTheDocument()
  expect(dialog.queryByText('17.00')).not.toBeInTheDocument()
  fireEvent.click(dialog.getByRole('tab', { name: 'Judge Two' }))
  expect(dialog.getByText('Skill: 9')).toBeInTheDocument()
  expect(dialog.getAllByText('90.00%').length).toBeGreaterThan(0)
  fireEvent.keyDown(dialog.getByRole('tab', { name: 'Judge Two' }), { key: 'ArrowRight' })
  expect(dialog.getByRole('tab', { name: 'Panel Summary' })).toHaveAttribute('aria-selected', 'true')
  expect(dialog.getByText('85.00%')).toBeInTheDocument()
  expect(dialog.getByText('20%')).toBeInTheDocument()
  expect(dialog.getByText('80%')).toBeInTheDocument()
  expect(dialog.getByText('2.00')).toBeInTheDocument()
})

test('shows the actual raw-score, criterion-weight and panel-aggregation steps', () => {
  const input = props()
  input.configuration.criteria[0].percentage = 60
  input.calculation.output_snapshot.worksheets[1].total = 48
  input.calculation.output_snapshot.worksheets[1].criteria[0].percentage = 60
  input.calculation.output_snapshot.worksheets[1].criteria[0].contribution = 48
  input.calculation.output_snapshot.worksheets[1].criteria[0].minors[0].maxScore = 10
  input.calculation.output_snapshot.roundResults = [{
    contestantId: 'entry', roundId: 'final', judgeTotals: [80, 90],
    baseScore: 85, finalScore: 83, deductionTotal: 2,
  }]
  render(<Breakdown {...input} />)
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByLabelText('Step-by-step criterion calculation')).toHaveTextContent(
    'Skill: 8.00 ÷ 10.00 × 100 = 80.00%. Combined criterion score = 80.00%. × 60.00% criterion weight = 48.00 percentage points.',
  )
  fireEvent.click(dialog.getByRole('tab', { name: 'Panel Summary' }))
  expect(dialog.getByLabelText('How this scoring method calculated the result')).toHaveTextContent(
    'Average judge totals (80.00, 90.00) = 85.00 percentage points; subtract 2.00 approved deduction(s) = 83.00 percentage points',
  )
})

test('points basis displays raw major points and omits normalized percentages and weights', () => {
  const input = props()
  input.configuration.scoringConfig.criterionBasis = 'points'
  input.configuration.scoringConfig.calculationMethod = 'sum'
  input.calculation.output_snapshot.worksheets = [{ entryId: 'entry', roundId: 'final', judgeId: 'judge1', total: 8, criteria: [{ criteriaId: 'technique', name: 'Technique', raw: 8, contribution: 8 }] }]
  render(<Breakdown {...input}/> )
  expect(screen.getByRole('columnheader', { name: 'Points' })).toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: 'Weight' })).not.toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: 'Normalized score' })).not.toBeInTheDocument()
  expect(screen.getByText('8', { selector: 'td' })).toBeInTheDocument()
  expect(screen.getByText(/Criterion percentages are not applied/)).toBeInTheDocument()
  expect(screen.getByLabelText('Step-by-step criterion calculation')).toHaveTextContent('Raw criterion score = 8.00 points')
})

test.each(['weighted_average', 'sum', 'highest_score', 'lowest_removal', 'rank_based'])(
  '%s shows weighted criterion contributions as percentage points',
  method => {
    const input = props()
    input.configuration.scoringConfig.calculationMethod = method
    input.configuration.criteria[0].percentage = 60
    input.calculation.output_snapshot.worksheets[1].criteria[0].contribution = 48
    input.calculation.output_snapshot.worksheets[1].total = 48
    render(<Breakdown {...input} />)
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('columnheader', { name: 'Weighted contribution (%)' })).toBeInTheDocument()
    expect(dialog.getAllByText('48.00%', { selector: 'td' }).length).toBeGreaterThan(0)
    expect(dialog.getByRole('row', { name: /Judge weighted total/ })).toHaveTextContent('48.00%')
  },
)

test('rank summary distinguishes numeric carry from placement adjustments', () => {
  const input = props()
  input.configuration.scoringConfig.calculationMethod = 'rank_based'
  Object.assign(input.calculation.output_snapshot.results[0], { baseScore: 3, finalScore: 4, deductionTotal: 1, numericCarryScore: 82, judgeRanks: { judge1: 1, judge2: 2 } })
  render(<Breakdown {...input}/> )
  fireEvent.click(screen.getByRole('tab', { name: 'Panel Summary' }))
  expect(screen.getAllByText(/Judge One: 1/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/Judge Two: 2/).length).toBeGreaterThan(0)
  expect(screen.getByText('Placement adjustment')).toBeInTheDocument()
  expect(screen.getByText('Combined numeric score')).toBeInTheDocument()
  expect(screen.getByText('4.00')).toBeInTheDocument()
  expect(screen.getByText('82.00')).toBeInTheDocument()
})
