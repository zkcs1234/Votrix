import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ElectionDashboardPage from './ElectionDashboardPage'
import EventStatsTable from '@/components/organizer/EventStatsTable'
import { electionService } from '@/services/election.service'

vi.mock('@/services/election.service', () => ({ electionService: { getDashboard: vi.fn() } }))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))

const event = (id, status, votingEnabled = false) => ({
  id, title: `Election ${id}`, status, votingEnabled,
})

function renderDashboard(events = []) {
  electionService.getDashboard.mockResolvedValue({ data: {
    events,
    stats: { totalEvents: events.length, activeVoting: 1, registeredVoters: 12, votesCast: 3 },
    eventBreakdown: events.map((item) => ({ ...item, registered: 12, participated: 1, rate: 8.33 })),
  } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}><ElectionDashboardPage /></QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Election Dashboard', () => {
  it('uses an empty state and the existing creation route when there are no elections', async () => {
    renderDashboard()
    expect(await screen.findByText('No election events yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage Election' })).not.toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: /Create event/i })) {
      expect(link).toHaveAttribute('href', '/organizer/election/events/new')
    }
  })

  it('renders a single real election, keeps selection counts, and uses existing management links', async () => {
    renderDashboard([event('one', 'active', true)])
    const table = await screen.findByRole('table')
    expect(screen.getByText('Votes recorded').closest('.v-card-sm')).toHaveTextContent('3')
    expect(screen.queryByText('Votes cast')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Participation by event')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Election Events' })).toBeInTheDocument()
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Event', 'Status', 'Registered', 'Voted', 'Turnout'])
    expect(within(table).getByText('8.33%')).toBeInTheDocument()
    expect(within(table).queryByRole('link', { name: 'View Election one' })).not.toBeInTheDocument()
    expect(within(table).getByRole('link', { name: 'Election one' }))
      .toHaveAttribute('href', '/organizer/election/events/one/positions')
    expect(screen.queryByRole('heading', { name: 'Current Election' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage Election' })).not.toBeInTheDocument()
  })

  it('preserves search, status filtering, result counts, clearing, and event links', async () => {
    renderDashboard([event('alpha', 'active', true), event('beta', 'scheduled'), event('gamma', 'draft')])
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 3 of 3 events')

    fireEvent.change(screen.getByPlaceholderText('Search events'), { target: { value: 'beta' } })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 of 3 events')
    expect(within(table).getByRole('link', { name: 'Election beta' }))
      .toHaveAttribute('href', '/organizer/election/events/beta/positions')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by Status' }), { target: { value: 'draft' } })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByRole('link', { name: 'Election gamma' })).toBeInTheDocument()
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 of 3 events')

    fireEvent.change(screen.getByPlaceholderText('Search events'), { target: { value: 'missing' } })
    expect(within(table).getByText('No events match your search')).toHaveAttribute('colspan', '5')
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 0 of 3 events')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(within(table).getAllByRole('row')).toHaveLength(4)
  })

  it('preserves the shared table layout for other dashboards without the new optional props', () => {
    render(<MemoryRouter><EventStatsTable events={[
      { id: 'other', title: 'Other event', status: 'active', registered: 4, participated: 2, rate: 50 },
    ]} /></MemoryRouter>)
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
    expect(screen.queryByRole('columnheader', { name: 'Action' })).not.toBeInTheDocument()
  })
})
