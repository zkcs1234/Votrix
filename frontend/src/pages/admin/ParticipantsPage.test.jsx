import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ParticipantsPage from './ParticipantsPage'

vi.mock('@/components/admin/StudentsPanel', () => ({ default: () => <p>Students panel</p> }))
vi.mock('@/components/admin/JudgesPanel', () => ({ default: () => <p>Judges panel</p> }))
vi.mock('@/services/admin.service', () => ({ adminService: {} }))

function Location() {
  return <output data-testid="search">{useLocation().search}</output>
}

const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/admin/participants" element={<><ParticipantsPage /><Location /></>} />
      </Routes>
    </MemoryRouter>,
  )

describe('ParticipantsPage', () => {
  it('opens on Students by default', () => {
    renderAt('/admin/participants')
    expect(screen.getByText('Students panel')).toBeInTheDocument()
    expect(screen.queryByText('Judges panel')).not.toBeInTheDocument()
  })

  it('is participants only: no organizer tabs on this page', () => {
    renderAt('/admin/participants')
    expect(screen.queryByRole('tab', { name: /Invitations|Applications|Accounts/ })).not.toBeInTheDocument()
  })

  it('deep-links to Judges', () => {
    renderAt('/admin/participants?category=judges')
    expect(screen.getByText('Judges panel')).toBeInTheDocument()
  })

  it('falls back to Students for an unknown category', () => {
    renderAt('/admin/participants?category=nope')
    expect(screen.getByText('Students panel')).toBeInTheDocument()
  })

  it('switches category, records it in the URL and swaps the module accent', () => {
    renderAt('/admin/participants')
    fireEvent.click(screen.getByRole('tab', { name: 'Judges' }))

    expect(screen.getByText('Judges panel')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?category=judges')
    expect(screen.getByRole('tab', { name: 'Judges' }).closest('[data-module="competition-scoring"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Students' }))
    expect(screen.getByText('Students panel')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Students' }).closest('[data-module="election"]')).not.toBeNull()
  })
})
