import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ParticipantEventsPage from './ParticipantEventsPage'

const mocks = vi.hoisted(() => ({ getEvents: vi.fn(), user: null }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))
vi.mock('@/hooks/useCompetitionSync', () => ({ default: vi.fn() }))
vi.mock('@/services/voter.service', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, voterService: { ...actual.voterService, getEvents: mocks.getEvents } }
})

const event = (id, extra = {}) => ({
  id,
  title: `Event ${id}`,
  eventType: 'election',
  participantType: 'STUDENT',
  organization: 'Student Government',
  bucket: 'active',
  statusLabel: 'Voting open',
  actionPath: `/participant/events/${id}`,
  actionLabel: 'Cast vote',
  ...extra,
})

const response = (events, extra = {}) => ({
  data: { events, total: events.length, page: 1, limit: 12, counts: { active: 2, assigned: 1 }, ...extra },
})

const renderPage = () => render(<MemoryRouter><ParticipantEventsPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user = { id: 's1', role: 'participant', participantTypes: ['STUDENT'] }
  mocks.getEvents.mockResolvedValue(response([event('a'), event('b')]))
})
afterEach(cleanup)

describe('My events', () => {
  it('lists active and upcoming events with counts on the status tabs', async () => {
    renderPage()
    expect(await screen.findByText('Event a')).toBeInTheDocument()
    expect(screen.getByText('Event b')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^All\s*\d+$/ })).toHaveTextContent('3')
    expect(screen.getByRole('tab', { name: /^Active/ })).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: /^Upcoming/ })).toHaveTextContent('1')
  })

  it('asks the server for the chosen status', async () => {
    renderPage()
    await screen.findByText('Event a')
    fireEvent.click(screen.getByRole('tab', { name: /^Upcoming/ }))
    await waitFor(() => expect(mocks.getEvents).toHaveBeenLastCalledWith(expect.objectContaining({ bucket: 'assigned', page: 1 })))
  })

  it('a student can filter by elections and polls; a judge has no type filter', async () => {
    renderPage()
    await screen.findByText('Event a')
    expect(screen.getByRole('tab', { name: 'Elections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Polls' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Competitions' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Polls' }))
    await waitFor(() => expect(mocks.getEvents).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'poll' })))

    cleanup()
    mocks.user = { id: 'j1', role: 'participant', participantTypes: ['JUDGE'] }
    renderPage()
    await screen.findByText('Event a')
    expect(screen.queryByRole('tab', { name: 'Elections' })).not.toBeInTheDocument()
  })

  it('searches after a short pause', async () => {
    renderPage()
    await screen.findByText('Event a')
    fireEvent.change(screen.getByPlaceholderText(/Search events/), { target: { value: 'pageant' } })
    await waitFor(() => expect(mocks.getEvents).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'pageant' })))
  })

  it('says why the list is empty: nothing enrolled vs. no match', async () => {
    mocks.getEvents.mockResolvedValue(response([], { counts: { active: 0, assigned: 0 } }))
    renderPage()
    expect(await screen.findByText('No events to act on')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /^Active/ }))
    expect(await screen.findByText('No events match these filters')).toBeInTheDocument()
  })

  it('loads more pages and appends them', async () => {
    mocks.getEvents.mockResolvedValueOnce(response([event('a')], { total: 2 }))
    renderPage()
    await screen.findByText('Event a')
    mocks.getEvents.mockResolvedValueOnce(response([event('b')], { total: 2, page: 2 }))
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Event b')).toBeInTheDocument()
    expect(screen.getByText('Event a')).toBeInTheDocument()
    expect(mocks.getEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('shows an error with a retry that works', async () => {
    mocks.getEvents.mockRejectedValueOnce({ response: { data: { message: 'Server is busy' } } })
    renderPage()
    expect(await screen.findByText('Server is busy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Event a')).toBeInTheDocument()
  })

  it('ignores a slow response for filters that are no longer selected', async () => {
    let resolveSlow
    mocks.getEvents.mockImplementationOnce(() => new Promise((resolve) => { resolveSlow = resolve }))
    renderPage()
    mocks.getEvents.mockResolvedValue(response([event('fresh')]))
    fireEvent.click(await screen.findByRole('tab', { name: /^Active/ }))
    expect(await screen.findByText('Event fresh')).toBeInTheDocument()
    resolveSlow(response([event('stale')]))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByText('Event stale')).not.toBeInTheDocument()
  })
})
