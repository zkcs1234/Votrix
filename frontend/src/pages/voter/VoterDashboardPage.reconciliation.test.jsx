import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import VoterDashboardPage from './VoterDashboardPage'
const mocks = vi.hoisted(() => ({ overview: vi.fn(), listeners: new Map() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'judge', firstName: 'Judge' } }) }))
vi.mock('@/services/voter.service', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, voterService: { ...actual.voterService, getOverview: mocks.overview } }
})
vi.mock('@/services/socket.service', () => ({ isConnected: () => true, subscribe: (type, callback) => {
  const handlers = mocks.listeners.get(type) ?? new Set(); handlers.add(callback); mocks.listeners.set(type, handlers); return () => handlers.delete(callback)
} }))
const event = {
  id: 'event',
  eventType: 'competition_scoring',
  participantType: 'COMPETITION_JUDGE',
  title: 'Competition',
  organization: 'Northbridge University',
  startDate: '2026-10-26T08:00:00+08:00',
  actionPath: '/participant/competition/events/event/score',
  actionLabel: 'Open scoresheet',
  statusLabel: 'Waiting to open',
}
beforeEach(() => { vi.clearAllMocks(); mocks.listeners.clear(); mocks.overview.mockResolvedValue({ data: { stats: { total: 1, active: 0, assigned: 1, completed: 0 }, events: [event], assigned: [event], active: [], completed: [] } }) })
afterEach(cleanup)
test('versioned start session invalidation updates an already open assigned dashboard without refresh', async () => {
  render(<MemoryRouter><VoterDashboardPage /></MemoryRouter>); await screen.findByRole('heading', { name: 'Assigned events' })
  expect(screen.getByRole('heading', { name: 'Competition' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Waiting to open')
  const activeEvent = { ...event, bucket: 'active' }
  mocks.overview.mockResolvedValue({ data: { stats: { total: 1, active: 1, assigned: 0, completed: 0 }, events: [activeEvent], assigned: [], active: [activeEvent], completed: [] } })
  await act(async () => { for (const callback of mocks.listeners.get('session:contestant-changed') ?? []) callback({ eventId: 'event', session: { eventId: 'event' }, refresh: true }) })
  expect(screen.getByRole('heading', { name: 'Active events' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Assigned events' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Open scoresheet/ })).toHaveAttribute('href', event.actionPath)
})

test('renders the assigned event banner without adding a separate organizer panel', async () => {
  const objectOrgEvent = {
    ...event,
    id: 'event-with-object-org',
    organization: {
      id: 'org-123',
      name: 'Central University',
      logo: 'https://example.com/logo.png',
    },
    banner: 'https://example.com/banner.jpg',
    actionPath: null,
  }
  mocks.overview.mockResolvedValue({
    data: {
      stats: { total: 1, active: 1, assigned: 0, completed: 0 },
      events: [objectOrgEvent],
      assigned: [],
      active: [objectOrgEvent],
      completed: [],
    },
  })
  render(<MemoryRouter><VoterDashboardPage /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Active events' })
  expect(screen.getByRole('heading', { name: 'Competition' })).toBeInTheDocument()
  expect(document.querySelector('img[src="https://example.com/banner.jpg"]')).toBeInTheDocument()
  expect(document.querySelector('img[src="https://example.com/logo.png"]')).not.toBeInTheDocument()
})

test('renders completed event table safely with object organization', async () => {
  const completedEvent = {
    ...event,
    id: 'completed-event',
    bucket: 'completed',
    organization: { id: 'org-456', name: 'West Valley Academy' },
    actionPath: '/participant/events/completed-event',
  }
  mocks.overview.mockResolvedValue({
    data: {
      stats: { total: 1, active: 0, assigned: 0, completed: 1 },
      events: [completedEvent],
      assigned: [],
      active: [],
      completed: [completedEvent],
    },
  })
  render(<MemoryRouter><VoterDashboardPage /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Completed events' })
  expect(screen.getByText('West Valley Academy')).toBeInTheDocument()
})

