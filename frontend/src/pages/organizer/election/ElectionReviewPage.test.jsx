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

test('shows the whole roster size from meta.total, not just the first page', async () => {
  mocks.listVoters.mockResolvedValue({ data: { voters: new Array(3).fill({}), meta: { total: 742 } } })
  renderPage()
  expect(await screen.findByText('742')).toBeInTheDocument()
})

test('a failed load shows an error with a reload button and blocks publishing', async () => {
  mocks.getEvent.mockRejectedValue({ response: { data: { message: 'Boom' } } })
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent('Boom')
  expect(screen.getByRole('button', { name: 'Reload saved setup' })).toBeInTheDocument()
  expect(screen.queryByText('This event is closed')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Finish & Publish' })).not.toBeInTheDocument()
})

test('blocks publishing when the end date has already passed', async () => {
  mocks.candidates = [
    { id: 'candidate-1', positionId: 'president' },
    { id: 'candidate-2', positionId: 'secretary' },
  ]
  mocks.getEvent.mockResolvedValue({ data: { event: { title: 'Old', status: 'draft', endDate: '2020-01-01T00:00:00Z' } } })
  renderPage()
  expect(await screen.findByText('End date has not passed')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Finish & Publish' })).toBeDisabled()
})
