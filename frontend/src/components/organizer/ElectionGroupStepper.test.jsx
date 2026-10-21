import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import ElectionGroupStepper from './ElectionGroupStepper'
import { firstIncompleteSectionId, groupHasCandidatesForEveryPosition, groupHasPositions } from '@/utils/electionGroupProgress'

const sections = [
  { id: 'ssg', name: 'SSG' },
  { id: 'fstlp', name: 'FSTLP' },
  { id: 'third', name: 'Student Council' },
]

test('shows one current group, allows returning to completed groups, and locks future groups', () => {
  const onSelect = vi.fn()
  render(<ElectionGroupStepper sections={sections} currentId="fstlp" completedIds={['ssg']} onSelect={onSelect} />)

  const progress = screen.getByRole('navigation', { name: 'Election group progress' })
  expect(within(progress).getByText('SSG')).toBeInTheDocument()
  expect(within(progress).getByText('FSTLP')).toBeInTheDocument()
  expect(within(progress).getByText('Student Council')).toBeInTheDocument()
  expect(screen.getByText('Group 2 of 3')).toBeInTheDocument()
  expect(within(progress).getByRole('button', { name: /SSG/ })).toBeInTheDocument()
  expect(within(progress).queryByRole('button', { name: /Student Council/ })).not.toBeInTheDocument()

  fireEvent.click(within(progress).getByRole('button', { name: /SSG/ }))
  expect(onSelect).toHaveBeenCalledWith('ssg')
})

test('renders a single optional group without requiring another group', () => {
  render(<ElectionGroupStepper sections={[sections[0]]} currentId="ssg" onSelect={vi.fn()} />)
  expect(screen.getByText('Group 1 of 1')).toBeInTheDocument()
  expect(screen.getByText('SSG')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('readiness is calculated per group and does not require multiple groups', () => {
  const positions = [{ id: 'president' }, { id: 'secretary' }]
  expect(groupHasPositions(positions)).toBe(true)
  expect(groupHasPositions([])).toBe(false)
  expect(groupHasCandidatesForEveryPosition(positions, [{ positionId: 'president' }])).toBe(false)
  expect(groupHasCandidatesForEveryPosition(positions, [{ positionId: 'president' }, { positionId: 'secretary' }])).toBe(true)
  expect(firstIncompleteSectionId([sections[0]], ['ssg'])).toBe('ssg')
  expect(firstIncompleteSectionId(sections, ['ssg'])).toBe('fstlp')
})