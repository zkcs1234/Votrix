import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { reportsService } from '@/services/reports.service'
import ReportsOverviewPage from './ReportsOverviewPage'

vi.mock('@/services/reports.service', () => ({
  reportsService: { getOverview: vi.fn() },
}))

function open() {
  render(
    <MemoryRouter>
      <ReportsOverviewPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

it('shows module report links with event stats', async () => {
  reportsService.getOverview.mockResolvedValue({
    data: {
      report: {
        elections: [{
          id: 'election-1',
          title: 'Student election',
          reportPath: '/organizer/reports/election/election-1',
          stats: { turnoutPercentage: 75, votedCount: 3, totalVoters: 4 },
        }],
        competitions: [],
        polls: [],
      },
    },
  })

  open()

  const reportLink = await screen.findByRole('link', { name: /Student election/ })
  expect(reportLink).toHaveAttribute('href', '/organizer/election/events/election-1/report')
  expect(screen.getByText('75% turnout (3/4)')).toBeInTheDocument()
})

it('surfaces overview load errors and allows retry', async () => {
  reportsService.getOverview
    .mockRejectedValueOnce({ response: { data: { message: 'Reports unavailable' } } })
    .mockResolvedValueOnce({ data: { report: { elections: [], competitions: [], polls: [] } } })

  open()

  expect(await screen.findByRole('alert')).toHaveTextContent('Reports unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry reports' }))

  await waitFor(() => expect(reportsService.getOverview).toHaveBeenCalledTimes(2))
  expect((await screen.findAllByText('No events yet.')).length).toBe(3)
})
