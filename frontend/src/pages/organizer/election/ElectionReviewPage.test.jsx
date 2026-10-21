import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ElectionReviewPage from './ElectionReviewPage'

const mocks = vi.hoisted(() => ({
  sections: [],
  positions: [],
  candidates: [],
  getEvent: vi.fn(),
  listBallotSections: vi.fn(),
  listPositions: vi.fn(),
  listCandidates: vi.fn(),
  listVoters: vi.fn(),
  publishEvent: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/services/election.service', () => ({ electionService: {
  getEvent: mocks.getEvent,
  listBallotSections: mocks.listBallotSections,
  listPositions: mocks.listPositions,
  listCandidates: mocks.listCandidates,
  listVoters: mocks.listVoters,
  publishEvent: mocks.publishEvent,
} }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }))
vi.mock('@/hooks/useDelayedLoading', () => ({ useDelayedLoading: () => false }))

function renderPage() {
  render(<MemoryRouter initialEntries={['/organizer/election/events/event/review']}>
    <Routes><Route path="/organizer/election/events/:eventId/review" element={<ElectionReviewPage />} /></Routes>
  </MemoryRouter>)
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sections = [{ id: 'ssg', name: 'SSG' }]
  mocks.positions = [{ id: 'president' }, { id: 'secretary' }]
  mocks.candidates = [{ id: 'candidate-1', positionId: 'president' }]
  mocks.getEvent.mockResolvedValue({ data: { event: { title: 'SSG Election', status: 'draft' } } })
  mocks.listBallotSections.mockImplementation(async () => ({ data: { sections: mocks.sections } }))
  mocks.listPositions.mockImplementation(async () => ({ data: { positions: mocks.positions } }))
  mocks.listCandidates.mockImplementation(async () => ({ data: { candidates: mocks.candidates } }))
  mocks.listVoters.mockResolvedValue({ data: { voters: [] } })
  mocks.publishEvent.mockResolvedValue({ data: { event: { status: 'scheduled' } } })
})

test('does not allow publish when any position in the single group has no candidate', async () => {
  renderPage()
  expect(await screen.findByText('SSG')).toBeInTheDocument()
  expect(screen.getByText('Every position has at least one candidate')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Finish & Publish' })).toBeDisabled()
  expect(mocks.publishEvent).not.toHaveBeenCalled()
})

test('allows a complete single-group election to publish without adding another group', async () => {
  mocks.candidates = [
    { id: 'candidate-1', positionId: 'president' },
    { id: 'candidate-2', positionId: 'secretary' },
  ]
  renderPage()
  expect(await screen.findByText('SSG')).toBeInTheDocument()
  const publishButton = screen.getByRole('button', { name: 'Finish & Publish' })
  expect(publishButton).toBeEnabled()
  fireEvent.click(publishButton)
  await waitFor(() => expect(mocks.publishEvent).toHaveBeenCalledWith('event'))
})