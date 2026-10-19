import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import CompetitionRankingsPage from './CompetitionRankingsPage'
const mocks = vi.hoisted(() => ({ rankings: vi.fn(), foundation: vi.fn(), results: vi.fn(), listeners: new Map() }))
vi.mock('@/services/pageant.service', () => ({ pageantService: { getRankings: mocks.rankings, getFoundation: mocks.foundation, getResults: mocks.results } }))
vi.mock('@/services/socket.service', () => ({ isConnected: () => true, subscribe: (type, callback) => {
  const handlers = mocks.listeners.get(type) ?? new Set(); handlers.add(callback); mocks.listeners.set(type, handlers); return () => handlers.delete(callback)
} }))
const data = score => ({ rankings: [{ contestantId: 'entry', contestantName: 'Entry A', contestantNumber: 1, rank: 1, rankingScore: score }], judges: { submitted: 1, total: 1 }, rounds: [] })
beforeEach(() => { vi.clearAllMocks(); mocks.listeners.clear(); mocks.rankings.mockResolvedValue({ data: data(80) }); mocks.foundation.mockResolvedValue({ data: { foundation: { event: {}, divisions: [] } } }); mocks.results.mockResolvedValue({ data: { results: {} } }) })
afterEach(cleanup)
const mount = () => render(<MemoryRouter initialEntries={['/events/event/rankings']}><Routes><Route path="/events/:eventId/rankings" element={<CompetitionRankingsPage/>}/></Routes></MemoryRouter>)
test('unfiltered rankings refetch an event-only official publication notification', async () => {
  mount(); await screen.findByText('80.00')
  mocks.rankings.mockResolvedValue({ data: { ...data(90), isOfficial: true } })
  await act(async () => { for (const callback of mocks.listeners.get('rankings:updated') ?? []) callback({ eventId: 'event' }) })
  expect(screen.getByText('90.00')).toBeInTheDocument()
  expect(screen.getByText(/Published tabulation/)).toBeInTheDocument()
})
test('other owned competition payload cannot install its rankings in the open view', async () => {
  mount(); await screen.findByText('80.00')
  const count = mocks.rankings.mock.calls.length
  await act(async () => { for (const callback of mocks.listeners.get('rankings:updated') ?? []) callback({ eventId: 'foreign-event', rankings: data(99) }) })
  expect(mocks.rankings).toHaveBeenCalledTimes(count)
  expect(screen.getByText('80.00')).toBeInTheDocument()
  expect(screen.queryByText('99.00')).not.toBeInTheDocument()
})
