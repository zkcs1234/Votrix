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

test('none hides rule controls; choosing judges saves explicit responsibility and limits', () => {
  const observe = vi.fn(); render(<Fixture observe={observe} />)
  expect(screen.queryByRole('button', { name: 'Add Deduction Rule' })).not.toBeInTheDocument()
  choose('Judges Apply Deductions')
  fireEvent.click(screen.getByRole('button', { name: 'Add Deduction Rule' }))
  fireEvent.change(screen.getByLabelText('Deduction rule name'), { target: { value: 'Late start' } })
  fireEvent.click(screen.getByLabelText('Allow separate deductions for repeated violations'))
  fireEvent.change(screen.getByLabelText('Maximum deduction occurrences'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save deduction rule' }))
  expect(observe.mock.lastCall[0].scoringConfig).toMatchObject({ deductionMode: 'judge', deductionRules: [{ description: 'Late start', appliedBy: 'judge', amount: 2, units: 'points', perViolation: true, maxOccurrences: 3 }] })
})
test('preliminary inherits organizer while final uses its own judge mode', () => {
  const value = single(), observe = vi.fn()
  value.structure = 'multiple'; value.scoringConfig.deductionMode = 'organizer'
  value.rounds = [{ id: 'pre', name: 'Preliminary' }, { id: 'final', name: 'Final' }]
  render(<Fixture value={value} observe={observe} />)
  fireEvent.change(screen.getByLabelText('Deduction settings scope'), { target: { value: 'final' } })
  choose('Judges Apply Deductions')
  const saved = observe.mock.lastCall[0]
  expect(saved.scoringConfig.deductionMode).toBe('organizer')
  expect(saved.rounds[0].deductionMode).toBeUndefined()
  expect(saved.rounds[1].deductionMode).toBe('judge')
})
test('criterion rules use the same round owner and disabling requires consent', () => {
  const observe = vi.fn(); render(<Fixture observe={observe} />)
  choose('Organizer Applies Deductions')
  fireEvent.click(screen.getByRole('button', { name: 'Add Deduction Rule' }))
  fireEvent.change(screen.getByLabelText('Deduction rule name'), { target: { value: 'Technique penalty' } })
  fireEvent.change(screen.getByLabelText('Deduction scope'), { target: { value: 'criterion' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save deduction rule' }))
  expect(observe.mock.lastCall[0].scoringConfig.deductionRules[0]).toMatchObject({ criteriaId: 'technique', appliedBy: 'organizer' })
  const count = observe.mock.calls.length
  vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
  choose('No Deductions'); expect(observe).toHaveBeenCalledTimes(count)
  window.confirm.mockReturnValueOnce(true)
  choose('No Deductions'); expect(observe.mock.lastCall[0].scoringConfig.deductionRules).toEqual([])
})
test('frozen settings cannot change responsibility', () => {
  render(<Fixture readOnly />)
  expect(screen.getByRole('radio', { name: /^Judges Apply Deductions/ })).toBeDisabled()
})
