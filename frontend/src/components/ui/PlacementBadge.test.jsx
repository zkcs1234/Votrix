import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import PlacementBadge from './PlacementBadge'

test.each([
  ['1', 'first', '1st place'],
  [2, 'second', '2nd place'],
  [3, 'third', '3rd place'],
  [4, 'other', '4th place'],
  [11, 'other', '11th place'],
])('shows a readable color-coded badge for %s place', (rank, tone, label) => {
  render(<PlacementBadge rank={rank} />)
  const badge = screen.getByLabelText(label)
  expect(badge).toHaveAttribute('data-placement', tone)
  expect(badge).toHaveTextContent(String(rank))
})

test('keeps ties visible and leaves unavailable placements unbadged', () => {
  const { rerender } = render(<PlacementBadge rank={1} tied />)
  expect(screen.getByLabelText('1st place, tied')).toHaveTextContent('(tie)')
  rerender(<PlacementBadge rank={null} />)
  expect(screen.getByText('—')).not.toHaveClass('v-placement-badge')
})
