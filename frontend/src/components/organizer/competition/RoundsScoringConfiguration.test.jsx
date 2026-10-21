import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import RoundsScoringEditor from './RoundsScoringEditor'
import { setupReadiness } from '../../../../../shared/competition-setup-readiness.js'
import { validScore } from '../../../../../shared/competition-score-input.js'

const blank = () => ({ structure: 'single', rounds: [], criteria: [], scoringConfig: { calculationMethod: 'rank_based', tiePolicy: 'shared', decimalPlaces: 2, defaultMinScore: 1, defaultMaxScore: 10, deductionRules: [] } })
function Editor({ initial = blank(), observe = () => {}, ...props }) {
  const [value, setValue] = useState(initial)
  return <RoundsScoringEditor step="configuration" competitionName="Mr. Campus 2026" value={value} onChange={next => { setValue(next); observe(next) }} {...props}/>
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

test.each([0,1,2])('applying %i input decimal places updates saved direct and minor inputs across rounds and survives reopening', precision => {
  const initial=blank();initial.structure='multiple';initial.scoringConfig.calculationMethod='weighted_average';initial.scoringConfig.inputDecimalPlaces=2
  initial.rounds=[{id:'pre',name:'Preliminary',displayOrder:0},{id:'final',name:'Final',displayOrder:1}]
  initial.criteria=[
    {id:'direct',roundId:'pre',name:'Technique',percentage:100,minScore:1,maxScore:10,decimalPlaces:0,minorCriteria:[]},
    {id:'major',roundId:'final',name:'Performance',percentage:100,minScore:1,maxScore:10,decimalPlaces:1,minorCriteria:[{id:'minor',name:'Execution',minScore:1,maxScore:10,decimalPlaces:0}]},
  ]
  const observe=vi.fn(),editor=render(<Editor initial={initial} observe={observe} step="round-configuration" activeRoundId="pre"/>);
  setting('Score Input')
  expect(screen.getByLabelText('Input decimal places')).toHaveValue('')
  expect(screen.getByText(/Choosing a value replaces those limits for all criteria and rounds/)).toBeInTheDocument()
  input('Input decimal places',precision)
  const saved=JSON.parse(JSON.stringify(observe.mock.lastCall[0]))
  expect(saved.scoringConfig.inputDecimalPlaces).toBe(precision)
  expect(saved.scoringConfig.decimalPlaces).toBe(initial.scoringConfig.decimalPlaces)
  expect(saved.rounds).toEqual(initial.rounds)
  for(const criterion of saved.criteria){
    expect(criterion).not.toHaveProperty('decimalPlaces')
    for(const target of criterion.minorCriteria.length?criterion.minorCriteria:[criterion]){
      expect(target).not.toHaveProperty('decimalPlaces')
      expect(validScore('8.55',target,saved.scoringConfig)).toBe(precision===2)
      expect(validScore('8.5',target,saved.scoringConfig)).toBe(precision>=1)
      expect(validScore('8',target,saved.scoringConfig)).toBe(true)
    }
  }
  editor.unmount()
  render(<Editor initial={saved} step="round-configuration" activeRoundId="final"/>);
  click('Preview Score Sheet')
  const preview=screen.getByRole('region',{name:'Judge score sheet preview'}),field=within(preview).getByRole('spinbutton')
  expect(field).toHaveAttribute('step',String(10**-precision))
  fireEvent.change(field,{target:{value:'8.55'}})
  expect(within(preview).getByRole('button',{name:/Execution Lock/}).disabled).toBe(precision!==2)
})

test.each(['1-10','1-100','decimal'])('direct range preset %s keeps the configured decimal allowance', preset => {
  const initial=blank();initial.scoringConfig.calculationMethod='weighted_average';initial.scoringConfig.inputDecimalPlaces=2
  initial.criteria=[{id:'direct',roundId:null,name:'Technique',percentage:100,minScore:2,maxScore:20,minorCriteria:[]}]
  const observe=vi.fn();render(<Editor initial={initial} observe={observe}/>);
  click('Edit criterion Technique');input('Technique score range',preset);click('Save Criterion')
  expect(observe.mock.lastCall[0].criteria[0]).not.toHaveProperty('decimalPlaces')
  click('Preview Score Sheet')
  const preview=screen.getByRole('region',{name:'Judge score sheet preview'})
  expect(within(preview).getByRole('spinbutton')).toHaveAttribute('step','0.01')
  fireEvent.change(within(preview).getByRole('spinbutton'),{target:{value:'8.55'}})
  expect(within(preview).getByRole('button',{name:/Technique Lock/})).toBeEnabled()
})

test('saved individual precision is preserved until the organizer explicitly replaces it', () => {
  const initial=blank();initial.scoringConfig.calculationMethod='weighted_average';initial.scoringConfig.inputDecimalPlaces=0
  initial.criteria=[{id:'direct',roundId:null,name:'Technique',percentage:100,minScore:1,maxScore:10,decimalPlaces:2,minorCriteria:[]}]
  const observe=vi.fn();render(<Editor initial={initial} observe={observe}/>);
  click('Preview Score Sheet')
  expect(within(screen.getByRole('region',{name:'Judge score sheet preview'})).getByRole('spinbutton')).toHaveAttribute('step','0.01')
  click('Close Preview')
  expect(observe).not.toHaveBeenCalled()
  setting('Score Input');input('Input decimal places',0)
  expect(observe.mock.lastCall[0].criteria[0]).not.toHaveProperty('decimalPlaces')
  expect(initial.criteria[0].decimalPlaces).toBe(2)
  click('Preview Score Sheet')
  expect(within(screen.getByRole('region',{name:'Judge score sheet preview'})).getByRole('spinbutton')).toHaveAttribute('step','1')
})

test.each([['sum','Total Score','added together'],['highest_score','Highest judge score','highest completed judge total'],['lowest_removal','Remove extreme scores','removed, then the remaining totals are averaged']])('round summary, explanation and selector consistently display custom method %s', (method,name,description) => {
  const initial=blank();initial.structure='multiple';initial.scoringConfig.calculationMethod='weighted_average'
  initial.rounds=[{id:'pre',name:'Preliminary',displayOrder:0,calculationMethod:method},{id:'final',name:'Final',displayOrder:1}]
  initial.criteria=[{id:'direct',roundId:'pre',name:'Technique',percentage:100,minScore:1,maxScore:10,minorCriteria:[]}]
  const observe=vi.fn();render(<Editor initial={initial} observe={observe} step="round-configuration" activeRoundId="pre"/>);
  const card=screen.getByText('Scoring Method',{exact:true}).closest('details')
  expect(card.querySelector('.rs-setting-value')).toHaveTextContent(name)
  setting('Scoring Method')
  expect(screen.getByRole('note',{name:'Scoring method explanation'})).toHaveTextContent(description)
  input('Calculation method','rank_based')
  expect(card.querySelector('.rs-setting-value')).toHaveTextContent(name)
  expect(observe.mock.lastCall[0].rounds).toEqual(initial.rounds)
  input('Round calculation method','')
  expect(card.querySelector('.rs-setting-value')).toHaveTextContent('Rank-Based Placement')
  expect(screen.getByRole('note',{name:'Scoring method explanation'})).toHaveTextContent('lowest placement total ranks first')
  expect(observe.mock.lastCall[0].rounds[1]).toEqual(initial.rounds[1])
})

test('Mr. Campus acceptance: independent rounds, weighted minors, judge deductions, top ten, 40/60 carry and a local preview', () => {
  const initial = blank(); initial.scoringConfig.deductionMode = 'judge'
  const observe = vi.fn(); render(<Editor initial={initial} observe={observe}/>)
  fireEvent.click(screen.getByLabelText('Multiple Rounds'))
  input('Round 1 name', 'Preliminary'); click('+ Add Round'); input('Round 2 name', 'Final')
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
  expect(screen.getByRole('status')).toHaveTextContent('Total weight: 100%')
  const preliminary = structuredClone(observe.mock.lastCall[0].criteria)
  setting('Deductions'); fireEvent.click(screen.getByRole('radio', { name: 'Judges Apply Deductions' }))
  input('Deduction rule name', 'Late Stage Entry'); input('Deduction value', 2); click('Save deduction rule')
  setting('Round Advancement'); input('Advancement method', 'top_n'); input('Advance value', 10)
  setting('Next Round Score Handling'); input('Round scoring model', 'weighted')
  input('Preliminary contribution percentage', 40); input('Final contribution percentage', 60)
  const preId = observe.mock.lastCall[0].rounds[0].id
  click('Select round 02: Final')
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
  click('Select round 01: Preliminary')
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
  const observe = vi.fn(); render(<Editor initial={initial} observe={observe}/>); click('Select round 02: Final'); click('Copy Criteria From...'); input('Copy criteria into Final', 'pre')
  const [original, copied] = observe.mock.lastCall[0].criteria
  expect(original).toEqual(initial.criteria[0]); expect(copied.roundId).toBe('final'); expect(copied.id).not.toBe(original.id); expect(copied.minorCriteria[0].id).not.toBe(original.minorCriteria[0].id)
})

test('plain-language method explanations update immediately and the selected method controls the competition result', () => {
  const observe = vi.fn(); render(<Editor observe={observe}/>); setting('Scoring Method')
  expect(screen.getByRole('note', { name: 'Scoring method explanation' })).toHaveTextContent('the lowest placement total ranks first')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  input('Calculation method', 'weighted_average')
  expect(screen.getByRole('option', { name: 'Weighted Mean' })).toBeInTheDocument()
  expect(screen.getByRole('note', { name: 'Scoring method explanation' })).toHaveTextContent('Higher averages rank first.')
  expect(screen.getByRole('note', { name: 'Scoring method explanation' })).toHaveTextContent('criterion-weighted total')
  input('Calculation method', 'sum')
  expect(screen.getByRole('note', { name: 'Scoring method explanation' })).toHaveTextContent('added together')
  expect(screen.getByRole('note', { name: 'Scoring method explanation' })).toHaveTextContent('Higher totals rank first.')
  expect(observe.mock.lastCall[0].scoringConfig.calculationMethod).toBe('sum')
  input('Calculation method', 'manual'); expect(screen.getByLabelText('Manual decision basis')).toBeInTheDocument()
  expect(screen.getByText('VOTRIX does not calculate a numeric score for this method.', { exact: false })).toBeInTheDocument()
})

test('points-based scoring keeps the numeric average label rather than Weighted Mean', () => {
  const initial = blank(); initial.scoringConfig.criterionBasis = 'points'
  render(<Editor initial={initial}/>)
  setting('Scoring Method')
  expect(screen.getByRole('option', { name: 'Average Score' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Weighted Mean' })).not.toBeInTheDocument()
})

test('adding a round preserves weighted progression and criteria, and the new round can be selected', () => {
  const initial = blank(); initial.structure = 'multiple'
  initial.rounds = [{ id: 'pre', name: 'Preliminary', displayOrder: 0, progression: 'weighted', weight: 100 }]
  initial.criteria = [{ id: 'a', roundId: 'pre', name: 'Technique', percentage: 100, minScore: 1, maxScore: 10, minorCriteria: [] }]
  const observe = vi.fn(); render(<Editor initial={initial} observe={observe}/>); click('+ Add Round')
  const saved = observe.mock.lastCall[0]
  expect(saved.rounds[1]).toMatchObject({ displayOrder: 1, progression: 'weighted', weight: 0 })
  expect(saved.rounds[0].nextRoundId).toBe(saved.rounds[1].id)
  expect(saved.criteria).toEqual(initial.criteria)
  click('Select round 02: Unnamed round')
  expect(screen.getByRole('button', { name: 'Select round 02: Unnamed round' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('Round 2 of 2')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit criterion Technique' })).not.toBeInTheDocument()
})

test('round chips protect an unfinished criterion and switch its scope only after confirmation', () => {
  const initial = blank(); initial.structure = 'multiple'
  initial.rounds = [{ id: 'pre', name: 'Preliminary', displayOrder: 0 }, { id: 'final', name: 'Final', displayOrder: 1 }]
  render(<Editor initial={initial} hasPendingForm/>); click('Add Criterion'); input('Major criterion name', 'Unfinished')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  click('Select round 02: Final')
  expect(confirm).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Major criterion name')).toHaveValue('Unfinished')
  expect(screen.getByRole('button', { name: 'Select round 01: Preliminary' })).toHaveAttribute('aria-pressed', 'true')
  confirm.mockReturnValue(true); click('Select round 02: Final')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Select round 02: Final' })).toHaveAttribute('aria-pressed', 'true')
})
