import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompetitionReviewPage from './CompetitionReviewPage'
import { pageantService } from '@/services/pageant.service'
vi.mock('@/services/pageant.service', () => ({ pageantService: { getEvent: vi.fn(), getFoundation: vi.fn(), listJudges: vi.fn(), publishEvent: vi.fn() } }))
vi.mock('@/hooks/useDelayedLoading', () => ({ useDelayedLoading: () => true }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
let foundation
async function open() {
  render(<MemoryRouter initialEntries={['/organizer/competition/events/e/review']}><Routes><Route path="/organizer/competition/events/:eventId/review" element={<CompetitionReviewPage />} /></Routes></MemoryRouter>)
  await screen.findByText('Ready to publish?')
  fireEvent.click(screen.getByRole('checkbox'))
}
beforeEach(() => {
  vi.resetAllMocks()
  foundation = { event: { id: 'e' }, judges: [{ id: 'p', judgeId: 'j', role: 'judge', isActive: true }], scoringConfig: { confirmed: true, calculationMethod: 'weighted_average', tiePolicy: 'shared', decimalPlaces: 2, independentApproval: false }, contestants: [{ id: 'a' }], rounds: [{ id: 'saved-final', name: 'Final', criteriaIds: ['c'], contestantIds: ['a'], progression: 'back_to_zero' }], criteria: [{ id: 'c', name: 'Quality', percentage: 100, minScore: 1, maxScore: 100, minorCriteria: [] }] }
  pageantService.getEvent.mockResolvedValue({ data: { event: { id: 'e', status: 'draft', title: 'Competition' } } })
  pageantService.getFoundation.mockImplementation(async () => ({ data: { foundation: structuredClone(foundation) } }))
  pageantService.listJudges.mockResolvedValue({ data: { judges: [{ id: 'j' }] } })
  pageantService.publishEvent.mockResolvedValue({ data: { success: true } })
})
it('blocks publication for incomplete saved criteria and links directly to the affected round', async () => {
  foundation.criteria[0].percentage = 60
  await open()
  expect(screen.getByRole('button', { name: 'Finish & Publish' })).toBeDisabled()
  expect(screen.getByRole('link', { name: 'Final', exact: true })).toHaveAttribute('href', '/organizer/competition/events/e/workspace?tab=criteria&roundId=saved-final')
  expect(pageantService.publishEvent).not.toHaveBeenCalled()
})
it('valid saved criteria and acknowledgement retain the existing publication action', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Finish & Publish' }))
  await waitFor(() => expect(pageantService.publishEvent).toHaveBeenCalledWith('e', { acknowledged: true }))
})
it('a concurrent backend rejection refreshes readiness and blocks a stale publication retry', async () => {
  pageantService.publishEvent.mockImplementation(async () => { foundation.criteria[0].percentage = 80; throw { response: { data: { message: 'CRITERIA_SETUP_CHANGED_REFRESH' } } } })
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Finish & Publish' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finish & Publish' })).toBeDisabled())
  await screen.findByText(/20% remaining/)
  expect(pageantService.getFoundation).toHaveBeenCalledTimes(2)
})
it('confirmed settings with a deferred required reviewer cannot publish', async () => {
  foundation.scoringConfig.independentApproval = true
  await open()
  expect(screen.getByRole('button', { name: 'Finish & Publish' })).toBeDisabled()
  expect(screen.getByText(/Assign an active authorized reviewer/)).toBeInTheDocument()
  expect(pageantService.publishEvent).not.toHaveBeenCalled()
})
it('undecided draft rules cannot publish even when roster and criteria are present', async () => {
  foundation.scoringConfig.calculationMethod = 'undecided'; foundation.scoringConfig.confirmed = false
  await open()
  expect(screen.getByRole('button', { name: 'Finish & Publish' })).toBeDisabled()
})
it('frozen scheduled rules show amendment guidance instead of unsupported Unpublish', async () => {
  pageantService.getEvent.mockResolvedValue({ data: { event: { id: 'e', status: 'scheduled', title: 'Competition', officialRulesId: 'rules' } } })
  render(<MemoryRouter initialEntries={['/organizer/competition/events/e/review']}><Routes><Route path="/organizer/competition/events/:eventId/review" element={<CompetitionReviewPage />} /></Routes></MemoryRouter>)
  await screen.findByText('Published — ready for Live Control')
  expect(screen.queryByRole('button', { name: 'Unpublish to draft' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Authorized scoring amendments in Tabulation' })).toHaveAttribute('href', '/organizer/competition/events/e/tabulation')
  expect(screen.getByText(/approval and fresh judging are required/)).toBeInTheDocument()
})
