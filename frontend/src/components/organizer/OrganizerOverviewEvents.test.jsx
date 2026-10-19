import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OrganizerOverviewEvents from './OrganizerOverviewEvents'
import { electionService } from '@/services/election.service'
import { pageantService } from '@/services/pageant.service'
import { pollingService } from '@/services/polling.service'

vi.mock('@/services/election.service', () => ({ electionService: { listEvents: vi.fn() } }))
vi.mock('@/services/pageant.service', () => ({ pageantService: { listEvents: vi.fn() } }))
vi.mock('@/services/polling.service', () => ({ pollingService: { listEvents: vi.fn() } }))

const event = (id, eventType = 'election', status = 'active') => ({
  id, title: `Existing event ${id}`, eventType, status,
})
const response = (events) => ({ data: { events } })
const renderOverview = (dashboard = {}) => render(
  <MemoryRouter><OrganizerOverviewEvents dashboard={dashboard} /></MemoryRouter>,
)

beforeEach(() => {
  vi.resetAllMocks()
  electionService.listEvents.mockResolvedValue(response([]))
  pageantService.listEvents.mockResolvedValue(response([]))
  pollingService.listEvents.mockResolvedValue(response([]))
})

describe('Organizer Overview events', () => {
  it.each([0, 1, 2, 3, 4, 5, 9, 205])('renders at most four of %i events', async (count) => {
    electionService.listEvents.mockResolvedValue(response(
      Array.from({ length: count }, (_, index) => event(index)),
    ))
    renderOverview()

    if (count === 0) {
      expect(await screen.findByText('No events yet.')).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.getByText('Create an event to get started.')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Create Event'))
      for (const module of ['election', 'competition', 'polling']) {
        expect(screen.getAllByRole('link').some((link) =>
          link.getAttribute('href') === `/organizer/${module}/events/new`,
        )).toBe(true)
      }
    } else {
      const table = await screen.findByRole('table', { name: 'Your Events' })
      expect(within(table).getAllByRole('row')).toHaveLength(Math.min(count, 4) + 1)
      expect(within(table).getAllByRole('link')).toHaveLength(Math.min(count, 4))
      expect(screen.queryByText('Existing event 4')).not.toBeInTheDocument()
    }

    expect(Boolean(screen.queryByText('See All'))).toBe(count > 4)
    if (count > 4) {
      fireEvent.click(screen.getByText('See All'))
      for (const module of ['election', 'competition', 'polling']) {
        expect(screen.getAllByRole('link').some((link) =>
          link.getAttribute('href') === `/organizer/${module}/events`,
        )).toBe(true)
      }
    }
  })

  it('uses real titles, type labels, statuses, and management routes across modules', async () => {
    electionService.listEvents.mockResolvedValue(response([event('e', 'election', 'scheduled')]))
    pageantService.listEvents.mockResolvedValue(response([
      event('c', 'competition_scoring', 'active'), event('legacy', 'pageant', 'completed'),
    ]))
    pollingService.listEvents.mockResolvedValue(response([event('p', 'polling', 'draft')]))
    renderOverview()
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    const expected = [
      ['e', 'Election', 'scheduled', 'election', 'positions'],
      ['c', 'Competition', 'active', 'competition', 'contestants'],
      ['legacy', 'Pageant', 'completed', 'competition', 'contestants'],
      ['p', 'Poll', 'draft', 'polling', 'builder'],
    ]
    expected.forEach(([id, type, status, module, destination], index) => {
      expect(within(rows[index]).getByText(type)).toBeInTheDocument()
      expect(within(rows[index]).getByText(status)).toBeInTheDocument()
      expect(within(rows[index]).getByRole('link', { name: `View Existing event ${id}` }))
        .toHaveAttribute('href', `/organizer/${module}/events/${id}/${destination}`)
    })
  })

  it('refreshes when the existing dashboard updates', async () => {
    const { rerender } = renderOverview({ stats: { totalEvents: 1 } })
    await screen.findByText('No events yet.')
    pollingService.listEvents.mockResolvedValue(response([event('new', 'polling')]))
    rerender(<MemoryRouter><OrganizerOverviewEvents dashboard={{ stats: { totalEvents: 2 } }} /></MemoryRouter>)
    expect(await screen.findByText('Existing event new')).toBeInTheDocument()
    expect(pollingService.listEvents).toHaveBeenCalledTimes(2)
  })

  it('shows a fetch error instead of a misleading empty state or partial list', async () => {
    pollingService.listEvents.mockRejectedValue(new Error('Unavailable'))
    renderOverview()
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load your events.')
    expect(screen.queryByText('No events yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('does not show See All based on summary counts for events excluded from management lists', async () => {
    renderOverview({ stats: { totalEvents: 10 } })
    await waitFor(() => expect(screen.getByText('No events yet.')).toBeInTheDocument())
    expect(screen.queryByText('See All')).not.toBeInTheDocument()
  })
})
