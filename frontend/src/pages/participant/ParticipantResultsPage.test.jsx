import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ParticipantResultsPage from './ParticipantResultsPage'

const mocks = vi.hoisted(() => ({ getResults: vi.fn(), getElectionResults: vi.fn(), user: null }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))
vi.mock('@/hooks/useCompetitionSync', () => ({ default: vi.fn() }))
vi.mock('@/services/voter.service', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, voterService: { ...actual.voterService, getResults: mocks.getResults, getElectionResults: mocks.getElectionResults } }
})

const finalElection = { id: 'election:e1', kind: 'election', eventId: 'e1', title: 'Student council election', organizationName: 'Student Government', state: 'final', closedAt: '2026-03-12T00:00:00Z', resultsVisibility: 'public' }
const liveElection = { id: 'election:e2', kind: 'election', eventId: 'e2', title: 'SSG election', organizationName: 'Student Government', state: 'live', closedAt: '2026-12-01T00:00:00Z', resultsVisibility: 'real_time' }
const pendingElection = { id: 'election:e3', kind: 'election', eventId: 'e3', title: 'CCS council election', organizationName: 'CCS Council', state: 'pending', availableAfter: '2026-12-04T00:00:00Z', resultsVisibility: 'public' }
const competition = {
  id: 'competition:c1', kind: 'competition', eventId: 'c1', title: 'Intramurals opening pageant', organizationName: 'Sports Office',
  competitionName: 'Pageant', roundName: 'Final', state: 'published', publishedAt: '2026-10-10T00:00:00Z', method: 'weighted',
  standings: [
    { rank: 1, entryNumber: '07', name: 'Carla Mendoza', score: 94.2, manual: false },
    { rank: 2, entryNumber: '03', name: 'Dani Ortega', score: 92.85, manual: false },
  ],
}
const manualCompetition = { ...competition, id: 'competition:c2', title: 'Talent night', standings: [{ rank: 1, entryNumber: null, name: 'The Band', score: null, manual: true }] }

const electionDetail = {
  totalVoters: 100, votedCount: 78, turnoutPercentage: 78,
  positionSummaries: [{ positionId: 'p1', positionName: 'President', candidates: [] }],
}

const respond = (items) => ({ data: { items, total: items.length } })
const renderPage = () => render(<MemoryRouter><ParticipantResultsPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user = { id: 's1', role: 'participant', participantTypes: ['STUDENT'] }
  mocks.getResults.mockResolvedValue(respond([finalElection, pendingElection]))
  mocks.getElectionResults.mockResolvedValue({ data: { results: electionDetail } })
})
afterEach(cleanup)

describe('Results: elections', () => {
  it('lists results without loading any result body up front', async () => {
    renderPage()
    expect(await screen.findByText('Student council election')).toBeInTheDocument()
    expect(screen.getByText('Final')).toBeInTheDocument()
    expect(mocks.getElectionResults).not.toHaveBeenCalled()
  })

  it('fetches one election\'s results only when asked, and only once', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'View results' }))
    await waitFor(() => expect(mocks.getElectionResults).toHaveBeenCalledWith('e1'))
    expect(await screen.findByText('Voter turnout')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide results' }))
    expect(screen.queryByText('Voter turnout')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View results' }))
    expect(await screen.findByText('Voter turnout')).toBeInTheDocument()
    expect(mocks.getElectionResults).toHaveBeenCalledTimes(1)
  })

  it('shows a clear message, and lets you try again, if one election cannot be loaded', async () => {
    mocks.getElectionResults.mockRejectedValueOnce({ response: { data: { message: 'Results are not available yet' } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'View results' }))
    expect(await screen.findByText(/Results are not available yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'View results' }))
    expect(await screen.findByText('Voter turnout')).toBeInTheDocument()
  })

  it('marks live results as provisional', async () => {
    mocks.getResults.mockResolvedValue(respond([liveElection]))
    renderPage()
    expect(await screen.findByText('SSG election')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText(/Provisional until voting closes/)).toBeInTheDocument()
  })

  it('lists an election whose results appear later, without a way to open it', async () => {
    renderPage()
    const row = (await screen.findByText('CCS council election')).closest('.v-card')
    expect(within(row).getByText('Not yet')).toBeInTheDocument()
    expect(within(row).getByText(/Results appear after voting closes on/)).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'View results' })).not.toBeInTheDocument()
  })
})

describe('Results: competitions (judges)', () => {
  beforeEach(() => {
    mocks.user = { id: 'j1', role: 'participant', participantTypes: ['JUDGE'] }
  })

  it('shows the official standings, the publication, and that other judges\' scores are never shown', async () => {
    mocks.getResults.mockResolvedValue(respond([competition]))
    renderPage()
    expect(await screen.findByText('Intramurals opening pageant')).toBeInTheDocument()
    expect(screen.getByText(/Pageant · Final/)).toBeInTheDocument()
    expect(screen.getByText('Carla Mendoza')).toBeInTheDocument()
    expect(screen.getByText('94.2')).toBeInTheDocument()
    expect(screen.getByText(/Official results published/)).toBeInTheDocument()
    expect(screen.getByText(/never shown/)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Final score' })).toBeInTheDocument()
  })

  it('shows manual placements instead of a score', async () => {
    mocks.getResults.mockResolvedValue(respond([manualCompetition]))
    renderPage()
    expect(await screen.findByText('The Band')).toBeInTheDocument()
    expect(screen.getByText('Placement 1')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Result' })).toBeInTheDocument()
  })

  it('a judge never sees election controls', async () => {
    mocks.getResults.mockResolvedValue(respond([competition]))
    renderPage()
    await screen.findByText('Intramurals opening pageant')
    expect(screen.queryByRole('button', { name: 'View results' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})

describe('Results: states', () => {
  it('only offers the type filter when there is more than one kind', async () => {
    renderPage()
    await screen.findByText('Student council election')
    expect(screen.queryByRole('tab', { name: 'Competitions' })).not.toBeInTheDocument()

    cleanup()
    mocks.getResults.mockResolvedValue(respond([finalElection, competition]))
    renderPage()
    await screen.findByText('Intramurals opening pageant')
    fireEvent.click(screen.getByRole('tab', { name: 'Competitions' }))
    expect(screen.queryByText('Student council election')).not.toBeInTheDocument()
    expect(screen.getByText('Intramurals opening pageant')).toBeInTheDocument()
  })

  it('invites you back when nothing is shared yet', async () => {
    mocks.getResults.mockResolvedValue(respond([]))
    renderPage()
    expect(await screen.findByText('No results to show yet')).toBeInTheDocument()
  })

  it('shows an error with a working retry', async () => {
    mocks.getResults.mockRejectedValueOnce({ response: { data: { message: 'Results are unavailable' } } })
    renderPage()
    expect(await screen.findByText('Results are unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Student council election')).toBeInTheDocument()
  })
})
