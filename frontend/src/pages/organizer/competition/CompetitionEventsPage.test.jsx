import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CompetitionEventsPage from './CompetitionEventsPage'
import { pageantService } from '@/services/pageant.service'
vi.mock('@/services/pageant.service', () => ({ pageantService: { listEvents: vi.fn(), getFoundation: vi.fn() } }))
vi.mock('@/hooks/useDraft', () => ({ default: () => ({ hasDraft: false }) }))
beforeEach(() => vi.resetAllMocks())
it('shows load failure with Retry rather than a falsely empty competition list', async () => {
  pageantService.listEvents.mockRejectedValueOnce({ response: { status: 503, data: { message: 'Competition data unavailable' } } })
  pageantService.listEvents.mockResolvedValueOnce({ data: { events: [] } })
  render(<MemoryRouter><CompetitionEventsPage /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Competition data unavailable')
  expect(screen.queryByText(/No competitions yet/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading competitions' }))
  await screen.findByText(/No competitions yet/)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('draft Continue setup opens structure and scoring before contestants', async () => {
  pageantService.listEvents.mockResolvedValue({ data: { events: [{ id: 'e', title: 'New competition', status: 'draft' }] } })
  render(<MemoryRouter><CompetitionEventsPage /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: 'Continue setup' })).toHaveAttribute('href', '/organizer/competition/events/e/workspace')
})
