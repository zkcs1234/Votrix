import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import UserManagementPage from './UserManagementPage'

vi.mock('./OrganizerManagementPage', () => ({ default: () => <p>Organizer accounts</p> }))
vi.mock('@/components/admin/VotersPanel', () => ({
  default: ({ pool }) => <p>{pool === 'polling' ? 'Polling respondents' : 'Election voters'}</p>,
}))
vi.mock('@/components/admin/JudgesPanel', () => ({ default: () => <p>Competition judges</p> }))

function CurrentLocation() {
  const location = useLocation()
  return <output data-testid="current-location">{location.search}</output>
}

it('preserves participant pool selection in the URL while switching module accents', () => {
  render(
    <MemoryRouter initialEntries={['/admin/users?tab=participants&type=election-voter']}>
      <Routes>
        <Route path="/admin/users" element={<><UserManagementPage /><CurrentLocation /></>} />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getByText('Election voters')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Polling Respondent' }))

  expect(screen.getByText('Polling respondents')).toBeInTheDocument()
  expect(screen.getByTestId('current-location')).toHaveTextContent('tab=participants&type=polling-respondent')
  expect(screen.getByRole('tab', { name: 'Polling Respondent' }).closest('[data-module="polling"]')).not.toBeNull()
})
