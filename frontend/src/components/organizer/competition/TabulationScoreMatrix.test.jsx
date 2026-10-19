import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import Matrix from './TabulationScoreMatrix'
import { TabulationMetrics, TabulationOverviewCards, TabulationAuditTrail } from './TabulationOverview'

function fixture() {
  const criteria = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, name: `Criterion ${i + 1}`, percentage: 20 }))
  const entries = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, name: `Contestant ${i + 1}`, contestantNumber: i + 1 }))
  const progress = Array.from({ length: 7 }, (_, i) => ({ judgeId: `j${i}`, judgeName: `Judge ${i + 1}`, submitted: true }))
  const view = { roundId: null, complete: true, session: { status: 'closed', entry_ids: entries.map(entry => entry.id) }, entries, progress, deductionsResolved: true, rules: { configuration_snapshot: { structure: 'single', rounds: [], criteria, scoringConfig: { deductionMode: 'none', calculationMethod: 'weighted_average', decimalPlaces: 2, deductionRules: [] } } }, calculation: { id: 'calculation', version: 1, verified: false, finalized: false, output_snapshot: { results: entries.map((entry, i) => ({ contestantId: entry.id, rank: i + 1, baseScore: 95 - i, finalScore: 95 - i, deductionTotal: 0 })), worksheets: entries.flatMap(entry => progress.map(judge => ({ entryId: entry.id, judgeId: judge.judgeId, roundId: null, total: 90, criteria: criteria.map(criterion => ({ criteriaId: criterion.id, contribution: 18 })) }))) } } }
  return { view, criteria, roundId: null, method: 'weighted_average', search: '', onSearch: vi.fn(), onSelectEntry: vi.fn(), onOriginals: vi.fn(), onBreakdown: vi.fn(), onExportEntry: vi.fn(), onExport: vi.fn() }
}

test('reference-sized matrix renders twelve contestant rows with grouped seven-judge and five-criterion headers', () => {
  const props = fixture(); render(<Matrix {...props}/>)
  const table = screen.getByRole('table', { name: 'Contestant tabulation matrix' })
  expect(within(table).getAllByRole('rowheader')).toHaveLength(12)
  expect(within(table).getByRole('columnheader', { name: 'Judge totals' })).toHaveAttribute('colspan', '7')
  expect(within(table).getByRole('columnheader', { name: 'Criterion averages (weighted)' })).toHaveAttribute('colspan', '5')
  expect(screen.queryByRole('columnheader', { name: /Organizer penalty/ })).not.toBeInTheDocument()
  expect(within(table).getAllByText('18.00')).toHaveLength(60)
  expect(within(table).queryByText('Verified')).not.toBeInTheDocument()
  expect(within(table).getAllByText('Calculated')).toHaveLength(12)
  expect(screen.queryByText(/Raw total|Scoring summary|Entry Summary/)).not.toBeInTheDocument()
})

test('row inspection and export select an entry without exposing another repeated score table', () => {
  const props = fixture(); render(<Matrix {...props}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Contestant 2', exact: true }))
  expect(props.onSelectEntry).toHaveBeenCalledWith('e1')
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Contestant 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Export this entry' }))
  expect(props.onExportEntry).toHaveBeenCalledWith('e1')
  expect(screen.getAllByRole('table')).toHaveLength(1)
})

test('score sort keeps missing calculations last and status filter shows an empty state', () => {
  const props = fixture(); props.view.calculation.output_snapshot.results[0].finalScore = null
  render(<Matrix {...props}/>)
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort contestants' }), { target: { value: 'score' } })
  const rows = screen.getAllByRole('rowheader')
  expect(rows[0]).toHaveTextContent('Contestant 2'); expect(rows.at(-1)).toHaveTextContent('Contestant 1')
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter contestant status' }), { target: { value: 'Verified' } })
  expect(screen.getByText('No contestants match your filters.')).toBeInTheDocument()
})

test('missing a saved criterion contribution is not averaged as zero or as a partial panel', () => {
  const props = fixture(); props.view.calculation.output_snapshot.worksheets[0].criteria[0].contribution = undefined
  render(<Matrix {...props}/>)
  const row = screen.getByRole('rowheader', { name: 'Contestant 1' }).closest('tr')
  expect(within(row).getAllByText('18.00')).toHaveLength(4)
  expect(within(row).getByText('—')).toBeInTheDocument()
})

test('all overview source and calculation displays mask historical values when current sources are incomplete', () => {
  const props = fixture(); props.view.complete = false
  props.view.calculation.created_at = '2026-10-19T01:00:00Z'
  const { container } = render(<><Matrix {...props}/><TabulationMetrics view={props.view}/><TabulationOverviewCards {...props} choice={{ competitionName: 'Competition', roundName: 'Final' }} onStage={vi.fn()}/><TabulationAuditTrail view={props.view}/></>)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(container).not.toHaveTextContent('private historical value')
  expect(container).not.toHaveTextContent('Calculation version 1 saved')
  expect(container).not.toHaveTextContent('95.00')
  expect(screen.getByRole('button', { name: 'Open validation' })).toBeDisabled()
})

test('manual placement mode shows placements without numeric judge or criterion columns', () => {
  const props = fixture(); props.method = 'manual'; render(<Matrix {...props}/>)
  expect(screen.getByRole('columnheader', { name: 'Official placement' })).toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: 'Judge totals' })).not.toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: /Criterion averages/ })).not.toBeInTheDocument()
})
