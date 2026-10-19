import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import VoterDashboardPage from './VoterDashboardPage'
const mocks = vi.hoisted(() => ({ overview: vi.fn(), listeners: new Map() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'judge', firstName: 'Judge' } }) }))
vi.mock('@/services/voter.service', () => ({ voterService: { getOverview: mocks.overview }, PARTICIPANT_TYPE_META: {} }))
vi.mock('@/components/voter/VoterEventCard', () => ({ default: ({ event }) => <p>{event.title}</p> }))
vi.mock('@/services/socket.service', () => ({ isConnected: () => true, subscribe: (type, callback) => {
  const handlers = mocks.listeners.get(type) ?? new Set(); handlers.add(callback); mocks.listeners.set(type, handlers); return () => handlers.delete(callback)
} }))
const event = { id: 'event', eventType: 'competition_scoring', participantType: 'COMPETITION_JUDGE', title: 'Competition' }
beforeEach(() => { vi.clearAllMocks(); mocks.listeners.clear(); mocks.overview.mockResolvedValue({ data: { stats: { total: 1, active: 0, assigned: 1, completed: 0 }, events: [event], assigned: [event], active: [], completed: [] } }) })
afterEach(cleanup)
test('versioned start session invalidation updates an already open assigned dashboard without refresh', async () => {
  render(<VoterDashboardPage/>); await screen.findByText('Assigned events')
  mocks.overview.mockResolvedValue({ data: { stats: { total: 1, active: 1, assigned: 0, completed: 0 }, events: [event], assigned: [], active: [event], completed: [] } })
  await act(async () => { for (const callback of mocks.listeners.get('session:contestant-changed') ?? []) callback({ eventId: 'event', session: { eventId: 'event' }, refresh: true }) })
  expect(screen.getByText('Active events')).toBeInTheDocument()
  expect(screen.queryByText('Assigned events')).not.toBeInTheDocument()
})
