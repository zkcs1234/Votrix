import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import JudgeScoringPage from './JudgeScoringPage'

const mocks = vi.hoisted(() => ({ view: vi.fn(), draft: vi.fn(), published: vi.fn(), listeners: new Map(), connected: true, user: { id: 'judge', firstName: 'Test' } }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('@/services/pageant.service', () => ({ pageantService: { getSessionView: mocks.view } }))
vi.mock('@/services/competition-workflow.service', () => ({ workflowService: { draft: mocks.draft, getPublishedResults: mocks.published } }))
vi.mock('@/services/socket.service', () => ({ isConnected: () => mocks.connected, subscribe: (type, callback) => {
  const handlers = mocks.listeners.get(type) ?? new Set(); handlers.add(callback); mocks.listeners.set(type, handlers); return () => handlers.delete(callback)
} }))
vi.mock('@/components/voter/competition/CompetitionScoringForm', () => ({ default: ({ sheet, scores, onScoreChange }) => <div>
  <span data-testid="round">{sheet.roundName}</span><span data-testid="entry-open">{String(sheet.contestants[0].open)}</span>
  <input aria-label="Raw score" value={scores['entry:minor'] ?? ''} onChange={event => onScoreChange('entry', 'minor', event.target.value)}/>
</div> }))
const emit = (type, payload = {}) => { for (const callback of mocks.listeners.get(type) ?? []) callback(payload) }
const view = (override = {}) => ({
  viewerJudgeId: 'judge', event: { id: 'event-a', title: 'Audit Test' }, context: { judgeId: 'judge', sessionId: 'session', rulesVersion: 'rules', roundId: 'pre' },
  session: { id: 'session', eventId: 'event-a', status: 'active', revision: 1 },
  roundName: 'Preliminary', rulesVersion: 1, divisionsEnabled: true,
  allowedDivisions: [{ id: 'men', name: 'Men' }, { id: 'women', name: 'Women' }],
  contestants: [{ id: 'entry', name: 'Entry', divisionId: 'men', open: true, existingScores: { minor: 4 }, lockedCriteria: [] }],
  criteria: [{ id: 'criterion', name: 'Beauty', open: true, minors: [{ id: 'minor', minScore: 0, maxScore: 10 }] }],
  scoreBounds: { min: 0, max: 10 }, completion: { locked: 0, required: 1, ready: false }, drafts: [], ...override,
})
const mount = () => render(<MemoryRouter initialEntries={['/participant/competition/events/event-a/score']}><Routes><Route path="/participant/competition/events/:eventId/score" element={<JudgeScoringPage/>}/></Routes></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks(); mocks.listeners.clear(); mocks.connected = true; localStorage.clear()
  mocks.view.mockResolvedValue({ data: view() }); mocks.draft.mockResolvedValue({ data: { draft: { revision: 1 } } })
  mocks.published.mockResolvedValue({ data: { results: [], publishedAt: null } })
})
afterEach(cleanup)

test('older Preliminary response cannot overwrite newer Final response from a division read', async () => {
  mount(); await screen.findByTestId('round')
  let oldResolve, newResolve
  mocks.view.mockImplementationOnce(() => new Promise(resolve => { oldResolve = resolve }))
    .mockImplementationOnce(() => new Promise(resolve => { newResolve = resolve }))
  await act(async () => { emit('session:round-changed', { eventId: 'event-a' }) })
  fireEvent.change(screen.getByLabelText('Select Division'), { target: { value: 'men' } })
  await act(async () => { newResolve({ data: view({ roundName: 'Final', context: { judgeId: 'judge', sessionId: 'session', rulesVersion: 'rules', roundId: 'final' }, session: { id: 'session', status: 'active', revision: 2 } }) }) })
  expect(screen.getByTestId('round')).toHaveTextContent('Final')
  await act(async () => { oldResolve({ data: view() }) })
  expect(screen.getByTestId('round')).toHaveTextContent('Final')
})

test('foreign event pause leaves current sheet untouched and does not refetch', async () => {
  mount(); await screen.findByTestId('round')
  const calls = mocks.view.mock.calls.length
  await act(async () => { emit('session:status-changed', { session: { eventId: 'event-b', status: 'paused' } }) })
  expect(mocks.view).toHaveBeenCalledTimes(calls)
  expect(screen.getByTestId('round')).toHaveTextContent('Preliminary')
})

test('reconnect reconciles permissions while preserving same-context unsaved input and honoring server locks', async () => {
  mount(); await screen.findByLabelText('Raw score')
  await waitFor(() => expect(screen.getByLabelText('Raw score')).toHaveValue('4'))
  fireEvent.change(screen.getByLabelText('Raw score'), { target: { value: '9' } })
  mocks.view.mockResolvedValue({ data: view({ session: { id: 'session', status: 'active', revision: 2 }, contestants: [{ ...view().contestants[0], open: false }] }) })
  await act(async () => { mocks.connected = false; emit('ws:disconnected'); mocks.connected = true; emit('ws:connected') })
  expect(screen.getByTestId('entry-open')).toHaveTextContent('false')
  expect(screen.getByLabelText('Raw score')).toHaveValue('9')
  mocks.view.mockResolvedValue({ data: view({ session: { id: 'session', status: 'active', revision: 3 }, contestants: [{ ...view().contestants[0], lockedCriteria: ['criterion'], existingScores: { minor: 8 } }] }) })
  await act(async () => { emit('session:contestant-changed', { eventId: 'event-a' }) })
  expect(screen.getByLabelText('Raw score')).toHaveValue('8')
})

test('a lower session revision cannot reopen permissions after a newer closed response', async () => {
  mocks.view.mockResolvedValue({ data: view({ session: { id: 'session', status: 'active', revision: 9 }, contestants: [{ ...view().contestants[0], open: false }] }) })
  mount(); await screen.findByTestId('entry-open')
  mocks.view.mockResolvedValue({ data: view() })
  await act(async () => { emit('session:contestant-changed', { eventId: 'event-a' }) })
  expect(screen.getByTestId('entry-open')).toHaveTextContent('false')
})
