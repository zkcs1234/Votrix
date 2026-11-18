import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const f = vi.hoisted(() => ({ dashboard: vi.fn(), analytics: vi.fn() }))
vi.mock('@/services/organizer.service', () => ({ organizerService: { getDashboard: f.dashboard, getAnalytics: f.analytics } }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { email: 'organizer@example.com' } }) }))
vi.mock('@/hooks/useDelayedLoading', () => ({ useDelayedLoading: () => false }))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))
vi.mock('@/components/charts', () => ({ AreaChartView: () => null, PieChartView: () => null }))
vi.mock('@/components/upload/OrganizationLogoUpload', () => ({ default: () => null }))
vi.mock('@/components/organizer/OrganizerOverviewEvents', () => ({ default: () => null }))
vi.mock('@/components/organizer/CreateEventMenu', () => ({ default: () => null }))
import OrganizerDashboardPage from './OrganizerDashboardPage'

beforeEach(() => {
  f.dashboard.mockResolvedValue({ data: {
    activeSessions: [], organization: null, recentActivity: [],
    stats: {
      totalEvents: 5, activeEvents: 2, finishedEvents: 1,
      assignedVoters: 120, electionParticipants: 80,
      assignedRespondents: 60, pollingParticipants: 30, pollSubmissions: 33,
      assignedJudges: 7, pageantParticipants: 4, scoreSubmissions: 12,
    },
  } })
  f.analytics.mockResolvedValue({ data: { charts: { monthlyEvents: [], eventParticipation: [] } } })
})

it('shows a card for election voters, poll respondents and judges with how many took part', async () => {
  render(<MemoryRouter><OrganizerDashboardPage /></MemoryRouter>)
  const voters = (await screen.findByText('Election voters')).closest('div')
  expect(voters.parentElement).toHaveTextContent('120')
  expect(voters.parentElement).toHaveTextContent('80 have voted')
  expect(screen.getByText('Poll respondents').closest('div').parentElement).toHaveTextContent('30 have responded')
  const judges = screen.getByText('Judges').closest('div').parentElement
  expect(judges).toHaveTextContent('7')
  expect(judges).toHaveTextContent('12 score submissions')
})

it('counts completed ballots, poll responses and judge score submissions, not raw rows', async () => {
  render(<MemoryRouter><OrganizerDashboardPage /></MemoryRouter>)
  const card = (await screen.findByText('Ballots, responses & scores')).closest('div').parentElement
  // 80 ballots + 33 poll responses + 12 score submissions
  expect(card).toHaveTextContent('125')
  expect(card).toHaveTextContent('judge score submissions')
  expect(within(card).queryByText(/Votes, scores and poll answers/)).not.toBeInTheDocument()
  expect(screen.queryByText('Registered voters')).not.toBeInTheDocument()
})
