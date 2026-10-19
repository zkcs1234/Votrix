import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import CompetitionTabulationWorkspace from './CompetitionTabulationWorkspace'
import CompetitionReviewer from '@/components/voter/competition/CompetitionReviewer'

const mocks = vi.hoisted(() => ({ tabulation: vi.fn(), latest: vi.fn(), calculate: vi.fn(), review: vi.fn(), verify: vi.fn(), finalize: vi.fn(), publish: vi.fn(), listeners: new Map() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'reviewer' } }) }))
vi.mock('@/services/competition-workflow.service', () => ({ workflowService: { tabulation: mocks.tabulation, review: mocks.review, reviewerVerify: mocks.verify } }))
vi.mock('@/services/competition-tabulation.service', () => ({ competitionTabulationService: { getLatestCalculation: mocks.latest, calculate: mocks.calculate, finalize: mocks.finalize, publish: mocks.publish } }))
vi.mock('@/components/organizer/competition/CompetitionAdvancementPanel', () => ({ default: () => null }))
vi.mock('@/components/organizer/competition/CompetitionJudgeWorksheets', () => ({ default: () => null }))
vi.mock('@/services/socket.service', () => ({ isConnected: () => true, subscribe: (type, callback) => {
  const handlers = mocks.listeners.get(type) ?? new Set(); handlers.add(callback); mocks.listeners.set(type, handlers); return () => handlers.delete(callback)
} }))
const notify = () => { for (const callback of mocks.listeners.get('competition:workflow-updated') ?? []) callback({ eventId: 'event', action: 'verification' }) }
const base = {
  rules: { id: 'rules', version: 1, event: { id: 'event' }, scoringConfig: { calculationMethod: 'weighted_average', deductionRules: [], independentApproval: true }, judges: [], criteria: [], divisions: [], contestants: [{ id: 'a', name: 'Finalist A' }, { id: 'b', name: 'Eliminated B' }], rounds: [{ id: 'final', name: 'Final' }] },
  session: { id: 'session', submission_window: true }, worksheets: [], submissions: [], lockedSources: [], missing: [], results: [], deductions: [], eligibility: [], ready: true,
}
beforeEach(() => { vi.clearAllMocks(); mocks.listeners.clear(); mocks.tabulation.mockResolvedValue({ data: base }); mocks.latest.mockResolvedValue({ data: { calculation: null } }); mocks.review.mockResolvedValue({ data: { ...base, calculations: [] } }); vi.spyOn(window, 'prompt').mockReturnValue('Verified against sources'); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('automatic calculation, independent Verify, Finalize and Publish update both open views from invalidations', async () => {
  let latest = { id: 'calc', status: 'ready_for_verification', created_at: '2026-10-12', result_snapshot: [] }
  mocks.latest.mockImplementation(async () => ({ data: { calculation: latest } }))
  mocks.review.mockImplementation(async () => ({ data: { ...base, calculations: latest ? [latest] : [] } }))
  mocks.verify.mockImplementation(async () => { latest = { ...latest, status: 'under_verification' }; return { data: { calculation: latest } } })
  mocks.finalize.mockImplementation(async () => { latest = { ...latest, status: 'finalized' }; return { data: { calculation: latest } } })
  mocks.publish.mockImplementation(async () => { latest = { ...latest, status: 'published' }; return { data: { calculation: latest } } })
  render(<MemoryRouter><CompetitionTabulationWorkspace eventId="event"/><CompetitionReviewer eventId="event"/></MemoryRouter>)
  await screen.findByRole('button', { name: 'Verification & Audit' })
  expect(screen.queryByRole('button', { name: 'Calculate versioned results' })).not.toBeInTheDocument()
  expect(mocks.calculate).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('button', { name: 'Verify calculation independently' }))
  await waitFor(() => expect(mocks.verify).toHaveBeenCalledWith('event', 'calc', { reason: 'Verified against sources' }))
  await act(async () => { notify() })
  fireEvent.click(screen.getByRole('button', { name: 'Verification & Audit' }))
  expect(screen.getByRole('button', { name: 'Finalize results' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Finalize results' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Publish results' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Publish results' }))
  await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith('event', 'calc'))
})

test('manual ranking inputs and payload include only server-provided approved selected scope', async () => {
  const manual = { ...base, eligibleEntries: [base.rules.contestants[0]], rules: { ...base.rules, scoringConfig: { ...base.rules.scoringConfig, calculationMethod: 'manual', manualBasis: 'Confirmed panel' } } }
  mocks.tabulation.mockResolvedValue({ data: manual }); mocks.calculate.mockResolvedValue({ data: { calculation: { id: 'manual-calc' } } })
  render(<MemoryRouter><CompetitionTabulationWorkspace eventId="event"/></MemoryRouter>)
  await screen.findByRole('button', { name: 'Verification & Audit' })
  fireEvent.change(screen.getByLabelText('Tabulation round'), { target: { value: 'final' } })
  await waitFor(() => expect(mocks.tabulation).toHaveBeenCalledWith('event', 'final'))
  fireEvent.click(await screen.findByRole('button', { name: 'Verification & Audit' }))
  expect(screen.queryByLabelText('Eliminated B')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Finalist A'), { target: { value: '1' } })
  fireEvent.change(screen.getByPlaceholderText('Official decision reason'), { target: { value: 'Approved final placings' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save manual placements' }))
  await waitFor(() => expect(mocks.calculate).toHaveBeenCalledWith('event', { roundId: 'final', results: [{ contestantId: 'a', rank: 1 }], reason: 'Approved final placings' }))
})

test('reviewer loading failure has retry and never looks like empty successful verification', async () => {
  mocks.review.mockRejectedValueOnce({ response: { data: { message: 'Reviewer authorization unavailable' } } })
  render(<CompetitionReviewer eventId="event"/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Reviewer authorization unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry reviewer access' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(screen.getByText(/Official method:/)).toBeInTheDocument()
})
