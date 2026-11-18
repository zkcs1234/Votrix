import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VoterEventPage from './VoterEventPage'
import VoterEventHeader from '@/components/voter/VoterEventHeader'

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

test('event header shows the event title and styled back-to-dashboard link', () => {
  render(<MemoryRouter><VoterEventHeader event={{ title: 'Campus Election' }} eyebrow="Election ballot" /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Campus Election' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/participant')
  expect(screen.getByText('Election ballot')).toBeInTheDocument()
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

test('stays inside the participant layout: the Review bar lives in the layout footer slot', async () => {
  const slot = document.createElement('div')
  slot.id = 'stage-footer-portal'
  document.body.appendChild(slot)
  try {
    mocks.getBallot.mockResolvedValue({
      data: {
        votingOpen: true,
        ballotSectionId: 'section-1',
        currentSection: { id: 'section-1', name: 'General section' },
        sections: [{ id: 'section-1', name: 'General section' }],
        positions: [{
          id: 'p1', name: 'President', maxVote: 1, allowSkip: false,
          candidates: [{ id: 'c1', name: 'Ana Reyes' }],
        }],
        event: { title: 'Campus Election' },
      },
    })
    render(
      <MemoryRouter initialEntries={['/participant/events/election-1']}>
        <Routes>
          <Route path="/participant/events/:eventId" element={<VoterEventPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Campus Election' })).toBeInTheDocument()
    expect(slot).toContainElement(screen.getByRole('button', { name: 'Review ballot' }))
    // Nothing is pinned to the viewport on top of the layout.
    expect(document.querySelector('.fixed.inset-0')).toBeNull()
  } finally {
    slot.remove()
  }
})
