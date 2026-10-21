import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
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

test('shows the completion message and only the Live Control and event workspace actions', () => {
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
  expect(screen.getByText(/All 8 setup steps are complete/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Proceed to Live Control' })).toHaveAttribute('href', '/organizer/competition/events/event/live')
  expect(screen.getByRole('link', { name: /Exit to Events/ })).toHaveAttribute('href', '/organizer/competition/events/event/workspace')
  expect(within(screen.getByRole('main')).getAllByRole('link')).toHaveLength(2)
  expect(parentReview).not.toHaveBeenCalled()
})

test('loads the event title when the completion page is opened directly', async () => {
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
  expect(screen.getByRole('link', { name: 'Proceed to Live Control' })).toBeInTheDocument()
  expect(parentReview).toHaveBeenCalledWith('event')
})
