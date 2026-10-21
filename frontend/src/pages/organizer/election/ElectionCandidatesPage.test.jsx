import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ElectionCandidatesPage from './ElectionCandidatesPage'

const mocks = vi.hoisted(() => ({
  sections: [],
  positions: {},
  candidates: {},
  listBallotSections: vi.fn(),
  listPositions: vi.fn(),
  listCandidates: vi.fn(),
  createCandidate: vi.fn(),
  deleteCandidate: vi.fn(),
  uploadCandidatePhoto: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/services/election.service', () => ({ electionService: {
  listBallotSections: mocks.listBallotSections,
  listPositions: mocks.listPositions,
  listCandidates: mocks.listCandidates,
  createCandidate: mocks.createCandidate,
  deleteCandidate: mocks.deleteCandidate,
  uploadCandidatePhoto: mocks.uploadCandidatePhoto,
} }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }))
vi.mock('@/hooks/useEventStatus', () => ({ default: () => ({ status: 'draft', setupLocked: false }) }))
vi.mock('@/components/ui/ManagementWorkspace', () => ({ default: ({ title, formPanel, recordsPanel }) => (
  <section><h1>{title}</h1><div>{formPanel}</div><div>{recordsPanel}</div></section>
) }))
vi.mock('@/components/upload/ImageUploadField', () => ({ default: () => <div>Candidate photo field</div> }))

function renderPage() {
  render(<MemoryRouter initialEntries={['/organizer/election/events/event/candidates']}>
    <Routes>
      <Route path="/organizer/election/events/:eventId/candidates" element={<ElectionCandidatesPage />} />
      <Route path="/organizer/election/events/:eventId/voters" element={<h1>Voters setup</h1>} />
    </Routes>
  </MemoryRouter>)
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sections = [
    { id: 'ssg', name: 'SSG', displayOrder: 0 },
    { id: 'fstlp', name: 'FSTLP', displayOrder: 1 },
  ]
  mocks.positions = {
    ssg: [{ id: 'president', name: 'President' }],
    fstlp: [{ id: 'representative', name: 'Representative' }],
  }
  mocks.candidates = {
    ssg: [{ id: 'candidate-ssg', name: 'SSG Candidate', positionId: 'president' }],
    fstlp: [],
  }
  mocks.listBallotSections.mockResolvedValue({ data: { sections: mocks.sections } })
  mocks.listPositions.mockImplementation(async (_eventId, sectionId) => ({ data: { positions: mocks.positions[sectionId] ?? [] } }))
  mocks.listCandidates.mockImplementation(async (_eventId, _positionId, sectionId) => ({ data: { candidates: mocks.candidates[sectionId] ?? [] } }))
  mocks.createCandidate.mockImplementation(async (_eventId, positionId, payload) => {
    const section = Object.entries(mocks.positions).find(([, positions]) => positions.some((position) => position.id === positionId))?.[0]
    const candidate = { id: 'candidate-fstlp', positionId, ...payload }
    mocks.candidates[section] = [...mocks.candidates[section], candidate]
    return { data: { candidate } }
  })
})

test('keeps the current group gated until each position has a candidate', async () => {
  renderPage()
  expect(await screen.findByText('Group 2 of 2')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Election group progress' })).toHaveTextContent('FSTLP')
  expect(screen.getByRole('button', { name: 'Next: Voters' })).toBeDisabled()

  await screen.findByRole('option', { name: 'Representative' })
  const positionSelect = screen.getByRole('combobox')
  const candidateName = screen.getAllByRole('textbox')[0]
  fireEvent.change(positionSelect, { target: { value: 'representative' } })
  fireEvent.change(candidateName, { target: { value: 'FSTLP Candidate' } })
  expect(positionSelect).toHaveValue('representative')
  expect(candidateName).toHaveValue('FSTLP Candidate')
  fireEvent.submit(candidateName.closest('form'))

  await waitFor(() => expect(mocks.createCandidate).toHaveBeenCalledWith('event', 'representative', expect.objectContaining({ name: 'FSTLP Candidate' })))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next: Voters' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Next: Voters' }))
  expect(await screen.findByRole('heading', { name: 'Voters setup' })).toBeInTheDocument()
})