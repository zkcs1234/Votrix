import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ParticipantOverviewPage from './ParticipantOverviewPage'

const mocks = vi.hoisted(() => ({ getEvents: vi.fn(), getResults: vi.fn(), user: null, reloaders: [] }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))
// Capture the refresh the page registers so a test can simulate a live update.
vi.mock('@/hooks/useCompetitionSync', () => ({ default: (_eventId, refresh) => { mocks.reloaders.push(refresh) } }))
vi.mock('@/services/voter.service', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, voterService: { ...actual.voterService, getEvents: mocks.getEvents, getResults: mocks.getResults } }
})

const event = (id, bucket, extra = {}) => ({
  id,
  title: `Event ${id}`,
  eventType: 'election',
  participantType: 'STUDENT',
  organization: 'Student Government',
  bucket,
  statusLabel: bucket === 'active' ? 'Voting open' : 'Waiting to open',
  startDate: '2026-12-02T08:00:00Z',
  actionPath: `/participant/events/${id}`,
  actionLabel: 'View event',
  ...extra,
})

const eventsResponse = (events, counts) => ({ data: { events, total: events.length, counts } })
const resultsResponse = (items) => ({ data: { items, total: items.length } })

const renderPage = () => render(<MemoryRouter><ParticipantOverviewPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.reloaders.length = 0
  mocks.user = { id: 's1', role: 'participant', firstName: 'Alex', lastName: 'Reyes', participantTypes: ['STUDENT'], officership: null }
  mocks.getEvents.mockResolvedValue(eventsResponse([event('now', 'active'), event('later', 'assigned')], { active: 1, assigned: 1 }))
  mocks.getResults.mockResolvedValue(resultsResponse([]))
})
afterEach(cleanup)

describe('Participant Dashboard', () => {
  it('summarizes what needs you now and what is next', async () => {
    renderPage()
    expect(await screen.findByText('Event now')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Participant Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Needs you now').closest('div').parentElement).toHaveTextContent('1')
    expect(screen.getByText('Coming up', { selector: 'p' }).closest('div').parentElement).toHaveTextContent('1')
    expect(screen.getByRole('heading', { name: 'Coming up' })).toBeInTheDocument()
    expect(screen.getByText('Event later')).toBeInTheDocument()
  })

  it('is a summary: it asks for a bounded set of events, never the full history', async () => {
    renderPage()
    await screen.findByText('Event now')
    expect(mocks.getEvents).toHaveBeenCalledWith({ limit: 50 })
    expect(mocks.getResults).toHaveBeenCalledWith({ limit: 50 })
  })

  it('describes what a student or a judge will find here', async () => {
    renderPage()
    expect(await screen.findByText(/Elections and polls you are enrolled in/)).toBeInTheDocument()
    cleanup()
    mocks.user = { ...mocks.user, participantTypes: ['JUDGE'] }
    renderPage()
    expect(await screen.findByText(/Competitions you are judging/)).toBeInTheDocument()
  })

  it('tells you when nothing needs you', async () => {
    mocks.getEvents.mockResolvedValue(eventsResponse([event('later', 'assigned')], { active: 0, assigned: 1 }))
    renderPage()
    expect(await screen.findByText('Nothing needs you right now')).toBeInTheDocument()
  })

  it('welcomes an account with no events', async () => {
    mocks.getEvents.mockResolvedValue(eventsResponse([], { active: 0, assigned: 0 }))
    renderPage()
    expect(await screen.findByText('No events assigned yet')).toBeInTheDocument()
  })

  it('shows new results but never ones that are not available yet', async () => {
    mocks.getResults.mockResolvedValue(resultsResponse([
      { id: 'election:e1', kind: 'election', title: 'Council election', state: 'final' },
      { id: 'election:e2', kind: 'election', title: 'Later election', state: 'pending' },
      { id: 'competition:c1', kind: 'competition', title: 'Pageant', state: 'published', publishedAt: '2026-10-10T00:00:00Z' },
    ]))
    renderPage()
    expect(await screen.findByText('Council election')).toBeInTheDocument()
    expect(screen.getByText('Pageant')).toBeInTheDocument()
    expect(screen.queryByText('Later election')).not.toBeInTheDocument()
    expect(screen.getByText('Results ready').closest('div').parentElement).toHaveTextContent('2')
  })

  it('still works when the results teaser fails', async () => {
    mocks.getResults.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText('Event now')).toBeInTheDocument()
    expect(screen.queryByText('New results')).not.toBeInTheDocument()
  })

  it('shows the officer card only for an officer', async () => {
    renderPage()
    await screen.findByText('Event now')
    expect(screen.queryByText('Open organizer workspace')).not.toBeInTheDocument()

    cleanup()
    mocks.user = { ...mocks.user, officership: { organizerId: 'o1', organizationName: 'Computing Society', position: 'President' } }
    renderPage()
    expect(await screen.findByText('Open organizer workspace')).toBeInTheDocument()
  })

  it('shows an error with a working retry', async () => {
    mocks.getEvents.mockRejectedValueOnce({ response: { data: { message: 'Server is busy' } } })
    renderPage()
    expect(await screen.findByText('Server is busy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Event now')).toBeInTheDocument()
  })

  it('updates in place when a live event changes, without a refresh', async () => {
    renderPage()
    await screen.findByText('Event now')
    mocks.getEvents.mockResolvedValue(eventsResponse([event('now', 'active'), event('second', 'active')], { active: 2, assigned: 0 }))
    await waitFor(() => expect(mocks.reloaders.length).toBeGreaterThan(0))
    await mocks.reloaders.at(-1)()
    expect(await screen.findByText('Event second')).toBeInTheDocument()
  })
})
