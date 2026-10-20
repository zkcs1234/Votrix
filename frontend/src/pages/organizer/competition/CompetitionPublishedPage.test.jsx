import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const parentReview = vi.hoisted(() => vi.fn())
vi.mock('@/services/competition-native.service', () => ({
  nativeCompetitionService: { parentReview },
}))

import CompetitionPublishedPage from './CompetitionPublishedPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('shows the separate event work areas and their readiness guidance after setup', () => {
  render(
    <MemoryRouter initialEntries={[{
      pathname: '/organizer/competition/events/event/published',
      state: {
        eventTitle: 'Campus arts showcase',
        eventStatus: 'scheduled',
        startDate: '2030-01-01T09:00:00Z',
        endDate: '2030-01-02T17:00:00Z',
      },
    }]}>
      <Routes>
        <Route path="/organizer/competition/events/:eventId/published" element={<CompetitionPublishedPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'Campus arts showcase' })).toBeInTheDocument()
  expect(screen.getByText('Scheduled · Published')).toBeInTheDocument()
  expect(screen.getByText(/All 8 setup steps are complete/)).toBeInTheDocument()
  expect(screen.getByText('Live Control, Tabulation, and Results are event work areas—not extra setup steps.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Go to Live Control' })).toHaveAttribute('href', '/organizer/competition/events/event/live')
  expect(screen.getByRole('link', { name: 'Open Tabulation' })).toHaveAttribute('href', '/organizer/competition/events/event/tabulation/overview')
  expect(screen.getByRole('link', { name: 'Open Results' })).toHaveAttribute('href', '/organizer/competition/events/event/results')
  expect(screen.getByText(/Final calculations require the required scores to be submitted/)).toBeInTheDocument()
  expect(screen.getByText(/Official results become available after scores are calculated and finalized/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review event setup' })).toHaveAttribute('href', '/organizer/competition/events/event/review')
  expect(screen.getByRole('link', { name: 'Return to competition events' })).toHaveAttribute('href', '/organizer/competition/events')
  expect(parentReview).not.toHaveBeenCalled()
})

test('loads published event details when the confirmation page is opened directly', async () => {
  parentReview.mockResolvedValue({
    data: { event: { title: 'Loaded event', status: 'scheduled' } },
  })
  render(
    <MemoryRouter initialEntries={['/organizer/competition/events/event/published']}>
      <Routes>
        <Route path="/organizer/competition/events/:eventId/published" element={<CompetitionPublishedPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: 'Loaded event' })).toBeInTheDocument()
  expect(screen.getByText('Scheduled · Published')).toBeInTheDocument()
  expect(parentReview).toHaveBeenCalledWith('event')
})
