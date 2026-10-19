import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VoterEventPage from './VoterEventPage'

const mocks = vi.hoisted(() => ({ getBallot: vi.fn() }))

vi.mock('@/services/election.service', () => ({
  electionService: { getBallot: mocks.getBallot },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { firstName: 'Test', lastName: 'Voter' } }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('shows ballot load errors and recovers when retry succeeds', async () => {
  mocks.getBallot
    .mockRejectedValueOnce({ response: { status: 503, data: { message: 'Ballot service unavailable' } } })
    .mockResolvedValueOnce({
      data: {
        votingOpen: false,
        ballotSectionId: 'section-1',
        sections: [{ id: 'section-1', name: 'General section' }],
        positions: [],
        event: { title: 'Election' },
      },
    })

  render(
    <MemoryRouter initialEntries={['/participant/events/election-1']}>
      <Routes>
        <Route path="/participant/events/:eventId" element={<VoterEventPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('Ballot service unavailable')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading ballot' }))
  expect(await screen.findByText('Voting is not open for this event yet.')).toBeInTheDocument()
  expect(mocks.getBallot).toHaveBeenCalledTimes(2)
})
