import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import DeductionSettings from './DeductionSettings'

const single = () => ({ structure: 'single', rounds: [], criteria: [{ id: 'technique', roundId: null, name: 'Technique', percentage: 100 }], scoringConfig: { deductionMode: 'none', calculationMethod: 'weighted_average', deductionRules: [] } })
function Fixture({ value = single(), observe = () => {}, ...props }) {
  const [configuration, setConfiguration] = useState(value)
  return <DeductionSettings configuration={configuration} onChange={next => { observe(next); setConfiguration(next) }} {...props} />
}
const choose = name => fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${name}`) }))

test('only no-deduction and judge modes are offered; judge rules save responsibility and limits', () => {
  const observe = vi.fn(); render(<Fixture observe={observe} />)
  expect(screen.queryByRole('button', { name: 'Add Deduction Rule' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('radio')).toHaveLength(2)
  expect(screen.queryByRole('radio', { name: /Organizer Applies Deductions/ })).not.toBeInTheDocument()
  choose('Judges Apply Deductions')
  expect(screen.getByLabelText('Deduction rule name')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Deduction rule name'), { target: { value: 'Late start' } })
  fireEvent.click(screen.getByLabelText('Allow separate deductions for repeated violations'))
  fireEvent.change(screen.getByLabelText('Maximum deduction occurrences'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save deduction rule' }))
  expect(observe.mock.lastCall[0].scoringConfig).toMatchObject({ deductionMode: 'judge', deductionRules: [{ description: 'Late start', appliedBy: 'judge', amount: 2, units: 'points', perViolation: true, maxOccurrences: 3 }] })
})
test('a round can override the judge default and return to inheritance', () => {
  const value = single(), observe = vi.fn()
  value.structure = 'multiple'; value.scoringConfig.deductionMode = 'judge'
  value.rounds = [{ id: 'pre', name: 'Preliminary' }, { id: 'final', name: 'Final' }]
  render(<Fixture value={value} observe={observe} />)
  fireEvent.change(screen.getByLabelText('Deduction settings scope'), { target: { value: 'final' } })
  expect(screen.getByRole('checkbox', { name: /Use competition default/ })).toBeChecked()
  choose('No Deductions')
  const saved = observe.mock.lastCall[0]
  expect(saved.scoringConfig.deductionMode).toBe('judge')
  expect(saved.rounds[0].deductionMode).toBeUndefined()
  expect(saved.rounds[1].deductionMode).toBe('none')
  expect(screen.getByRole('checkbox', { name: /Use competition default/ })).not.toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: /Use competition default/ }))
  expect(observe.mock.lastCall[0].rounds[1].deductionMode).toBeUndefined()
  expect(screen.getByRole('radio', { name: 'Judges Apply Deductions' })).toBeChecked()
})
test('criterion rules are assigned to judges and disabling requires consent', () => {
  const observe = vi.fn(); render(<Fixture observe={observe} />)
  choose('Judges Apply Deductions')
  fireEvent.change(screen.getByLabelText('Deduction rule name'), { target: { value: 'Technique penalty' } })
  fireEvent.change(screen.getByLabelText('Deduction scope'), { target: { value: 'criterion' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save deduction rule' }))
  expect(observe.mock.lastCall[0].scoringConfig.deductionRules[0]).toMatchObject({ criteriaId: 'technique', appliedBy: 'judge' })
  const count = observe.mock.calls.length
  vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
  choose('No Deductions'); expect(observe).toHaveBeenCalledTimes(count)
  window.confirm.mockReturnValueOnce(true)
  choose('No Deductions'); expect(observe.mock.lastCall[0].scoringConfig.deductionRules).toEqual([])
})
test('frozen settings cannot change responsibility', () => {
  render(<Fixture readOnly />)
  for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
})

test('saved judge rules remain available to judges and can be disabled explicitly', () => {
  const value = single(), observe = vi.fn()
  value.scoringConfig.deductionMode = 'judge'
  value.scoringConfig.deductionRules = [{ id: 'late', description: 'Late start', amount: 2, units: 'points', roundId: null, appliedBy: 'judge' }]
  render(<Fixture value={value} observe={observe} />)
  expect(observe).not.toHaveBeenCalled()
  expect(screen.getByRole('radio', { name: 'Judges Apply Deductions' })).toBeChecked()
  expect(screen.queryByRole('button', { name: 'Add Deduction Rule' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit Late start' })).toBeEnabled()
  expect(screen.getByText(/Judges can apply configured rules while scoring/)).toBeInTheDocument()
  expect(screen.getByText(/Select this option again to add another rule/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'Judges Apply Deductions' }))
  expect(screen.getByLabelText('Deduction rule name')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
  choose('No Deductions'); expect(observe).not.toHaveBeenCalled()
  window.confirm.mockReturnValueOnce(true)
  choose('No Deductions')
  expect(observe.mock.lastCall[0].scoringConfig).toMatchObject({ deductionMode: 'none', deductionRules: [] })
})

test('retired organizer-mode rules can only be migrated to judge mode or removed', () => {
  const value = single(), observe = vi.fn()
  value.scoringConfig.deductionMode = 'organizer'
  value.scoringConfig.deductionRules = [{ id: 'late', description: 'Late start', amount: 2, units: 'points', roundId: null, appliedBy: 'organizer' }]
  render(<Fixture value={value} observe={observe} />)
  expect(screen.getByText(/uses the retired organizer deduction option/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add Deduction Rule' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit Late start' })).toBeDisabled()
  vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
  choose('Judges Apply Deductions')
  expect(observe.mock.lastCall[0].scoringConfig).toMatchObject({
    deductionMode: 'judge',
    deductionRules: [{ id: 'late', appliedBy: 'judge', amount: 2 }],
  })
  expect(screen.getByRole('button', { name: 'Edit Late start' })).toBeEnabled()
})

test('a round can inherit the saved judge default', () => {
  const value = single(), observe = vi.fn()
  value.structure = 'multiple'; value.scoringConfig.deductionMode = 'judge'
  value.rounds = [{ id: 'final', name: 'Final' }]
  render(<Fixture value={value} observe={observe} scopeRoundId="final" />)
  expect(screen.getByRole('checkbox', { name: /Use competition default/ })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Judges Apply Deductions' })).toBeChecked()
  expect(observe).not.toHaveBeenCalled()
})
