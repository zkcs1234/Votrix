import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ElectionPositionsPage from './ElectionPositionsPage'

const mocks = vi.hoisted(() => ({
  sections: [],
  positions: {},
  nextPositionId: 0,
  listBallotSections: vi.fn(),
  listPositions: vi.fn(),
  createPosition: vi.fn(),
  updatePosition: vi.fn(),
  deletePosition: vi.fn(),
  createBallotSection: vi.fn(),
  updateBallotSection: vi.fn(),
  deleteBallotSection: vi.fn(),
  getCohorts: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/services/election.service', () => ({ electionService: {
  listBallotSections: mocks.listBallotSections,
  listPositions: mocks.listPositions,
  createPosition: mocks.createPosition,
  updatePosition: mocks.updatePosition,
  deletePosition: mocks.deletePosition,
  createBallotSection: mocks.createBallotSection,
  updateBallotSection: mocks.updateBallotSection,
  deleteBallotSection: mocks.deleteBallotSection,
  getCohorts: mocks.getCohorts,
} }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { scope: { scopeType: 'scoped' } } }) }))
vi.mock('@/hooks/useEventStatus', () => ({ default: () => ({ status: 'draft', setupLocked: false }) }))
vi.mock('@/components/ui/ManagementWorkspace', () => ({ default: ({ title, formPanel, recordsPanel }) => (
  <section><h1>{title}</h1><div>{formPanel}</div><div>{recordsPanel}</div></section>
) }))

function renderPage() {
  render(<MemoryRouter initialEntries={['/organizer/election/events/event/positions']}>
    <Routes><Route path="/organizer/election/events/:eventId/positions" element={<ElectionPositionsPage />} /></Routes>
  </MemoryRouter>)
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sections = [
    { id: 'ssg', name: 'SSG', displayOrder: 0 },
    { id: 'fstlp', name: 'FSTLP', displayOrder: 1 },
  ]
  mocks.positions = { ssg: [], fstlp: [] }
  mocks.nextPositionId = 0
  mocks.listBallotSections.mockImplementation(async () => ({ data: { sections: mocks.sections } }))
  mocks.listPositions.mockImplementation(async (_eventId, sectionId) => ({ data: { positions: mocks.positions[sectionId] ?? [] } }))
  mocks.createPosition.mockImplementation(async (_eventId, payload, sectionId) => {
    const position = { id: `position-${++mocks.nextPositionId}`, ...payload }
    mocks.positions[sectionId] = [...(mocks.positions[sectionId] ?? []), position]
    return { data: { position } }
  })
})

test('keeps SSG current until it has a position, then advances to FSTLP', async () => {
  renderPage()
  const progress = await screen.findByRole('navigation', { name: 'Election group progress' })
  expect(within(progress).getByText('SSG')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next: FSTLP' })).toBeDisabled()
  expect(within(progress).queryByRole('button', { name: /FSTLP/ })).not.toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText('e.g. President'), { target: { value: 'President' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add position' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next: FSTLP' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Next: FSTLP' }))

  expect(await screen.findByText('Group 2 of 2')).toBeInTheDocument()
  expect(within(screen.getByRole('navigation', { name: 'Election group progress' })).getByText('FSTLP')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next: Candidates' })).toBeDisabled()
})