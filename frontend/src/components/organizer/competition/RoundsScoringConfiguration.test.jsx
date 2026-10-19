import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import RoundsScoringEditor from './RoundsScoringEditor'
import { setupReadiness } from '../../../../../shared/competition-setup-readiness.js'

const blank = () => ({ structure: 'single', rounds: [], criteria: [], scoringConfig: { calculationMethod: 'rank_based', tiePolicy: 'shared', decimalPlaces: 2, defaultMinScore: 1, defaultMaxScore: 10, deductionRules: [] } })
function Editor({ initial = blank(), observe = () => {} }) {
  const [value, setValue] = useState(initial)
  return <RoundsScoringEditor step="configuration" competitionName="Mr. Campus 2026" value={value} onChange={next => { setValue(next); observe(next) }}/>
}
const click = name => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const input = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const setting = title => fireEvent.click(screen.getByText(title, { exact: true }).closest('summary'))
const add = (name, weight, edit) => {
  click('Add Criterion'); input('Major criterion name', name); input('Major criterion weight (%)', weight)
  edit?.(); click('Save Criterion')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('Mr. Campus acceptance: independent rounds, weighted minors, deductions, top ten, 40/60 carry and a local preview', () => {
  const observe = vi.fn(); render(<Editor observe={observe}/>)
  fireEvent.click(screen.getByLabelText('Multiple Rounds'))
  input('Round 1 name', 'Preliminary'); click('+ Add Another Round'); input('Round 2 name', 'Final')
  add('Facial Features', 30, () => {
    fireEvent.click(screen.getByLabelText('Yes, add minor criteria'))
    fireEvent.click(screen.getByLabelText('Use weights'))
    for (const [name, weight] of [['Facial Symmetry', 40], ['Overall Facial Appeal', 60]]) {
      click('Add minor criterion'); input('Facial Features minor criterion name', name); click('Add')
      input(`${name} minor weight (%)`, weight)
    }
    expect(screen.getByText(/Minor weight total: 100%/)).toBeInTheDocument()
  })
  for (const [name, weight] of [['Communication Skills', 25], ['Poise & Bearing', 20], ['Stage Presence', 15], ['Overall Impression', 10]]) add(name, weight)
  expect(screen.getByText(/Total Weight: 100%/)).toBeInTheDocument()
  const preliminary = structuredClone(observe.mock.lastCall[0].criteria)
  setting('Deductions'); fireEvent.click(screen.getByRole('radio',{name:/^Organizer Applies Deductions/})); click('Add Deduction Rule')
  input('Deduction rule name', 'Late Stage Entry'); input('Deduction value', 2); click('Save deduction rule')
  setting('Round Advancement'); input('Advancement method', 'top_n'); input('Advance value', 10)
  setting('Next Round Score Handling'); input('Round scoring model', 'weighted')
  input('Preliminary contribution percentage', 40); input('Final contribution percentage', 60)
  const preId = observe.mock.lastCall[0].rounds[0].id, finalId = observe.mock.lastCall[0].rounds[1].id
  input('Select Round', finalId)
  expect(screen.queryByText('Round Advancement', { exact: true })).not.toBeInTheDocument()
  expect(screen.queryByText('Next Round Score Handling', { exact: true })).not.toBeInTheDocument()
  expect(screen.queryByText('Late Stage Entry')).not.toBeInTheDocument()
  for (const [name, weight] of [['Stage Performance', 40], ['Question & Answer', 30], ['Formal Wear', 20], ['Overall Impression', 10]]) add(name, weight)
  const saved = observe.mock.lastCall[0]
  expect(saved.criteria.filter(c => c.roundId === preId)).toEqual(preliminary)
  expect(saved.scoringConfig.deductionRules[0].roundId).toBe(preId)
  expect(setupReadiness(saved).allReady).toBe(true)
  observe.mockClear(); click('Preview Score Sheet')
  const preview = screen.getByRole('region', { name: 'Judge score sheet preview' })
  expect(within(preview).getByText('Round: Final')).toBeInTheDocument()
  expect(within(preview).queryByText('Facial Symmetry')).not.toBeInTheDocument()
  for (const field of within(preview).getAllByRole('spinbutton')) fireEvent.change(field, { target: { value: '8' } })
  expect(within(preview).getByText('80.00 / 100')).toBeInTheDocument()
  click('Close Preview'); expect(observe).not.toHaveBeenCalled()
  click('Preview Score Sheet'); expect(screen.getByText('Complete all inputs')).toBeInTheDocument(); click('Close Preview')
  input('Select Round', preId)
  expect(screen.getByRole('button', { name: 'Edit criterion Facial Features' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit criterion Formal Wear' })).not.toBeInTheDocument()
}, 15000)

test('only essential information is visible initially, and custom criterion ranges can be selected and cancelled', () => {
  const initial = blank(); initial.criteria = [{ id: 'major', roundId: null, name: 'Technique', percentage: 100, minScore: 1, maxScore: 10, minorCriteria: [] }]
  const observe = vi.fn(); render(<Editor initial={initial} observe={observe}/>)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  for (const title of ['Deductions', 'Tie Rules', 'Scoring Method', 'Score Input']) expect(screen.getByText(title, { exact: true }).closest('details')).not.toHaveAttribute('open')
  expect(screen.queryByText('Round Advancement', { exact: true })).not.toBeInTheDocument()
  click('Edit criterion Technique'); input('Technique score range', 'custom')
  input('Technique minimum', 2); input('Technique maximum', 20); click('Cancel')
  expect(observe).not.toHaveBeenCalled()
  click('Edit criterion Technique'); input('Technique score range', 'custom'); input('Technique maximum', 100); click('Save Criterion')
  expect(observe.mock.lastCall[0].criteria[0]).toMatchObject({ minScore: 1, maxScore: 100 })
  expect(screen.getByText('Range: 1–100')).toBeInTheDocument()
})

test('ranges are configured only inside criteria; new criteria start at 1-10 without changing existing ranges', () => {
  const initial = blank(); initial.scoringConfig.defaultMinScore = 2; initial.scoringConfig.defaultMaxScore = 20
  initial.criteria = [
    { id: 'a', roundId: null, name: 'Technique', percentage: 25, minScore: 1, maxScore: 10, minorCriteria: [{ id: 'm', name: 'Timing', minScore: 1, maxScore: 10 }] },
    { id: 'b', roundId: null, name: 'Expression', percentage: 25, minScore: 2, maxScore: 20, minorCriteria: [] },
  ]
  const observe = vi.fn(); render(<Editor initial={initial} observe={observe}/>)
  expect(screen.queryByText('Default Score Range')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Default minimum score')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Default maximum score')).not.toBeInTheDocument()
  click('Add Criterion'); input('Major criterion name', 'Impact'); input('Major criterion weight (%)', 50)
  expect(screen.getByLabelText('Impact score range')).toHaveValue('1-10')
  expect(within(screen.getByLabelText('Impact score range')).getByRole('option', { name: 'Default (1–10)' })).toBeInTheDocument()
  click('Save Criterion')
  const saved = observe.mock.lastCall[0]
  expect(saved.criteria.slice(0, 2)).toEqual(initial.criteria)
  expect(saved.criteria[2]).toMatchObject({ name: 'Impact', minScore: 1, maxScore: 10 })
  expect(saved.scoringConfig).toEqual(initial.scoringConfig)
})

test('the selected round can be previewed while another round is still incomplete', () => {
  const initial = blank(); initial.structure = 'multiple'; initial.rounds = [{ id: 'pre', name: 'Preliminary', displayOrder: 0 }, { id: 'final', name: 'Final', displayOrder: 1 }]
  initial.criteria = [{ id: 'a', roundId: 'pre', name: 'Technique', percentage: 100, minScore: 1, maxScore: 10, minorCriteria: [] }]
  const observe = vi.fn(); render(<Editor initial={initial} observe={observe}/>); click('Preview Score Sheet')
  const preview = screen.getByRole('region', { name: 'Judge score sheet preview' })
  fireEvent.change(within(preview).getByRole('spinbutton'), { target: { value: '8' } })
  expect(within(preview).getByText('80.00 / 100')).toBeInTheDocument(); expect(observe).not.toHaveBeenCalled()
})

test('weighted minor totals block a criterion save, and switching to no weights removes all percentages', () => {
  const initial = blank(); initial.criteria = [{ id: 'a', roundId: null, name: 'Technique', percentage: 100, minScore: 1, maxScore: 10, minorCriteria: [{ id: 'm', name: 'Timing', minScore: 1, maxScore: 10 }] }]
  const observe = vi.fn(); render(<Editor initial={initial} observe={observe}/>); click('Edit criterion Technique')
  fireEvent.click(screen.getByLabelText('Use weights')); expect(screen.getByLabelText('Timing minor weight (%)')).toHaveValue(0)
  input('Timing minor weight (%)', 90); click('Save Criterion'); expect(screen.getByRole('alert')).toHaveTextContent('total 100%'); expect(observe).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('No weights')); click('Save Criterion'); expect(observe.mock.lastCall[0].criteria[0].minorCriteria[0].percentage).toBeUndefined()
})

test('copying criteria generates independent major and minor identities', () => {
  const initial = blank(); initial.structure = 'multiple'; initial.rounds = [{ id: 'pre', name: 'Preliminary', displayOrder: 0, nextRoundId: 'final' }, { id: 'final', name: 'Final', displayOrder: 1 }]
  initial.criteria = [{ id: 'a', roundId: 'pre', name: 'Technique', percentage: 100, minScore: 1, maxScore: 10, minorCriteria: [{ id: 'm', name: 'Timing', minScore: 1, maxScore: 10 }] }]
  const observe = vi.fn(); render(<Editor initial={initial} observe={observe}/>); input('Select Round', 'final'); click('Copy Criteria From...'); input('Copy criteria into Final', 'pre')
  const [original, copied] = observe.mock.lastCall[0].criteria
  expect(original).toEqual(initial.criteria[0]); expect(copied.roundId).toBe('final'); expect(copied.id).not.toBe(original.id); expect(copied.minorCriteria[0].id).not.toBe(original.minorCriteria[0].id)
})

test('scoring samples change immediately and the primary method controls the competition result', () => {
  const observe = vi.fn(); render(<Editor observe={observe}/>); setting('Scoring Method')
  expect(screen.getByText('Weighted scoring happens first:', { exact: false })).toHaveTextContent('8 ÷ 10 × 40 = 32 points')
  expect(screen.getByRole('table')).toHaveTextContent('Rank-Based Placement')
  input('Calculation method', 'sum'); expect(screen.getByRole('table')).toHaveTextContent('268')
  expect(observe.mock.lastCall[0].scoringConfig.calculationMethod).toBe('sum')
  input('Calculation method', 'manual'); expect(screen.getByLabelText('Manual decision basis')).toBeInTheDocument()
  expect(screen.getByText('VOTRIX does not calculate a numeric score for this method.', { exact: false })).toBeInTheDocument()
})
