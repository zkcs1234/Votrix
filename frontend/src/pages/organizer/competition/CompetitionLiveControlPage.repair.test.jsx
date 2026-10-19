import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import CompetitionLiveControlPage from './CompetitionLiveControlPage'

const mocks = vi.hoisted(() => ({ active: vi.fn(), foundation: vi.fn(), event: vi.fn(), progress: vi.fn(), unlock: vi.fn() }))
vi.mock('@/services/competition-session.service.js', () => ({ competitionSessionService: { getActiveSession: mocks.active, getJudgeProgress: mocks.progress, unlockScore: mocks.unlock } }))
vi.mock('@/services/pageant.service.js', () => ({ pageantService: { getFoundation: mocks.foundation, getEvent: mocks.event } }))
vi.mock('@/components/organizer/competition/CompetitionControlSteps', () => ({ default: () => null }))
vi.mock('@/services/socket.service', () => ({ isConnected: () => true, subscribe: () => () => {} }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/hooks/useDelayedLoading', () => ({ useDelayedLoading: () => false }))
const entry = { id: 'entry', name: 'Entry A', contestantNumber: 1, open: true }
const session = { id: 'session', status: 'active', rulesVersion: 'rules', currentRoundId: 'round', roundContestants: [entry], contestantOrder: ['entry'], criteriaControl: [], startedAt: '2026-10-12T00:00:00Z' }
const mount = () => render(<MemoryRouter initialEntries={['/events/event/live']}><Routes><Route path="/events/:eventId/live" element={<CompetitionLiveControlPage/>}/></Routes></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.active.mockResolvedValue({ data: { session } }); mocks.event.mockResolvedValue({ data: { event: { id: 'event', status: 'active', title: 'Competition' } } })
  mocks.foundation.mockResolvedValue({ data: { foundation: { event: { status: 'active' }, contestants: [entry], divisions: [] } } })
  mocks.progress.mockResolvedValue({ data: { judges: [{ judgeId: 'judge', displayName: 'Judge A' }], contestants: [entry], submitted: [{ judgeId: 'judge', contestantId: 'entry' }], progress: [{ judgeId: 'judge', contestantId: 'entry', lockedCount: 1, fullyLocked: true, lockedCriteria: ['criterion'] }], criteria: [{ id: 'criterion', name: 'Beauty' }], criteriaTotal: 1 } })
  mocks.unlock.mockResolvedValue({ data: { success: true } })
  vi.spyOn(window, 'prompt').mockReturnValue('Correct the recorded value')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
test('grid Unlock records a reason and explicit confirmation through the correction service contract', async () => {
  mount()
  fireEvent.click(await screen.findByTitle("Fully locked — click to reopen this judge's whole score"))
  await waitFor(() => expect(mocks.unlock).toHaveBeenCalledWith('event', 'entry', 'judge', null, { reason: 'Correct the recorded value', confirmed: true }))
})
test('cancelled or blank correction never requests an unlock', async () => {
  window.prompt.mockReturnValue('   ')
  mount(); fireEvent.click(await screen.findByTitle("Fully locked — click to reopen this judge's whole score"))
  expect(mocks.unlock).not.toHaveBeenCalled()
  expect(window.confirm).not.toHaveBeenCalled()
})
test('failed session read has explicit recovery and cannot masquerade as no active session', async () => {
  mocks.active.mockRejectedValueOnce({ response: { data: { message: 'Live Control permission unavailable' } } })
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('Live Control permission unavailable')
  expect(screen.queryByRole('button', { name: 'Start Live Session' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry Live Control' }))
  await screen.findByTitle("Fully locked — click to reopen this judge's whole score")
})
