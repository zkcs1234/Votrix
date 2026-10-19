import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import CompetitionPublishedResults from './CompetitionPublishedResults'

const mocks = vi.hoisted(() => ({ get: vi.fn(), listeners: new Map() }))
vi.mock('@/services/competition-workflow.service', () => ({ workflowService: { getPublishedResults: mocks.get } }))
vi.mock('@/services/socket.service', () => ({ isConnected: () => true, subscribe: (type, callback) => {
  const callbacks = mocks.listeners.get(type) ?? new Set(); callbacks.add(callback); mocks.listeners.set(type, callbacks); return () => callbacks.delete(callback)
} }))
beforeEach(() => { mocks.listeners.clear(); vi.clearAllMocks() })
afterEach(cleanup)
test('judge results stay absent until official publication, then safe published results appear automatically', async () => {
  mocks.get.mockResolvedValue({ data: { results: [{ contestantId: 'a', contestantName: 'A', finalScore: 90, rank: 1 }], publishedAt: null } })
  render(<CompetitionPublishedResults eventId="event" judgeId="judge"/>)
  await act(async () => {})
  expect(screen.queryByRole('heading', { name: 'Official published results' })).not.toBeInTheDocument()
  mocks.get.mockResolvedValue({ data: { results: [{ contestantId: 'a', contestantName: 'A', finalScore: 90, rank: 1 }], publishedAt: '2026-10-12T00:00:00Z', method: 'weighted_average' } })
  await act(async () => { for (const callback of mocks.listeners.get('competition:results-published') ?? []) callback({ eventId: 'event' }) })
  expect(screen.getByRole('heading', { name: 'Official published results' })).toBeInTheDocument()
  expect(screen.getByText('90')).toBeInTheDocument()
  expect(screen.queryByText(/Judge total/)).not.toBeInTheDocument()
})
