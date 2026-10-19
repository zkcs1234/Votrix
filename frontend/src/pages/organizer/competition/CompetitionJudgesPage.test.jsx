import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompetitionJudgesPage from './CompetitionJudgesPage'
import { pageantService } from '@/services/pageant.service'
vi.mock('@/services/pageant.service', () => ({ pageantService: {
  getEvent: vi.fn(), listJudges: vi.fn(), getFoundation: vi.fn(), getJudgePool: vi.fn(), pickJudges: vi.fn(), updateJudgeV2: vi.fn(), deleteJudgeV2: vi.fn(), createJudgeAssignment: vi.fn(), deleteJudgeAssignment: vi.fn(),
} }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
let foundation
beforeEach(() => {
  vi.resetAllMocks()
  foundation = { event: { status: 'draft' }, judges: [{ id: 'j', displayName: 'Existing Judge', role: 'judge' }], assignments: [], scoringConfig: {} }
  pageantService.getEvent.mockResolvedValue({ data: { event: { status: 'draft' } } })
  pageantService.listJudges.mockResolvedValue({ data: { judges: foundation.judges } })
  pageantService.getFoundation.mockImplementation(async () => ({ data: { foundation } }))
  pageantService.getJudgePool.mockResolvedValue({ data: { judges: [] } })
})
function open() { render(<MemoryRouter initialEntries={['/events/e/judges']}><Routes><Route path="/events/:eventId/judges" element={<CompetitionJudgesPage />} /></Routes></MemoryRouter>) }
it('roster failure is recoverable and cannot appear as an empty successful enrollment list', async () => {
  pageantService.listJudges.mockRejectedValueOnce({ response: { status: 503, data: { message: 'Judge roster unavailable' } } })
  open()
  expect(await screen.findByRole('alert')).toHaveTextContent('Judge roster unavailable')
  expect(screen.queryByText('No judges added yet.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Add.*judges$/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry enrolled judges' }))
  await waitFor(() => expect(screen.getAllByText('Existing Judge')).toHaveLength(2))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('published rules freeze judge roles and every assignment control even before live scoring', async () => {
  foundation.event.status = 'scheduled'; foundation.event.official_rules_id = 'rules'
  pageantService.getEvent.mockResolvedValue({ data: { event: { status: 'scheduled' } } })
  open(); await screen.findByText(/official judge panel and assignments are locked/)
  expect(screen.queryByLabelText('Role for Existing Judge')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Assign all' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add assignment' })).toBeDisabled()
  expect(pageantService.pickJudges).not.toHaveBeenCalled()
})
it('enrollment status does not claim that a judge submitted the current round', async () => {
  foundation.judges[0].hasScored = true
  open(); await screen.findByText('Enrolled')
  expect(screen.queryByText('Submitted')).not.toBeInTheDocument()
  expect(screen.getByText(/round submission progress is shown in Live Control/)).toBeInTheDocument()
})
