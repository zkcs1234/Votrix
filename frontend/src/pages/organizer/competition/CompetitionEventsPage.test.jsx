import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CompetitionEventsPage from './CompetitionEventsPage'
import { pageantService } from '@/services/pageant.service'
import { nativeCompetitionService } from '@/services/competition-native.service'
vi.mock('@/services/pageant.service', () => ({ pageantService: { listEvents: vi.fn(), getFoundation: vi.fn(), listContestants: vi.fn() } }))
vi.mock('@/services/competition-native.service', () => ({ nativeCompetitionService: { list: vi.fn(), foundation: vi.fn(), entries: vi.fn() } }))
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
const liveEvent = { id: 'e', title: 'Live competition', status: 'published' }
it('previews a native competition from its child data without the legacy foundation route', async () => {
  pageantService.listEvents.mockResolvedValue({ data: { events: [liveEvent] } })
  nativeCompetitionService.list.mockResolvedValue({ data: { competitions: [{ id: 'c1', name: 'Singing', origin: 'native' }] } })
  nativeCompetitionService.foundation.mockResolvedValue({ data: { configuration: { criteria: [{ id: 'k1', name: 'Voice', percentage: 60, minScore: 1, maxScore: 10, minorCriteria: [] }] } } })
  nativeCompetitionService.entries.mockResolvedValue({ data: { entries: [{ id: 'en1', contestant_id: 'p1', entry_number: 3 }] } })
  pageantService.listContestants.mockResolvedValue({ data: { contestants: [{ id: 'p1', name: 'Ana Cruz' }] } })
  render(<MemoryRouter><CompetitionEventsPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
  expect(await screen.findByText('Voice')).toBeInTheDocument()
  expect(screen.getByText('60% · score 1–10')).toBeInTheDocument()
  expect(screen.getByText('Ana Cruz')).toBeInTheDocument()
  expect(screen.getByText('#3')).toBeInTheDocument()
  expect(pageantService.getFoundation).not.toHaveBeenCalled()
})
it('keeps previewing legacy events through the event foundation', async () => {
  pageantService.listEvents.mockResolvedValue({ data: { events: [liveEvent] } })
  nativeCompetitionService.list.mockResolvedValue({ data: { competitions: [] } })
  pageantService.getFoundation.mockResolvedValue({ data: { foundation: { criteria: [{ id: 'k', name: 'Poise', percentage: 100 }], contestants: [{ id: 'p', name: 'Ben Lim', contestantNumber: 1 }] } } })
  render(<MemoryRouter><CompetitionEventsPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
  expect(await screen.findByText('Poise')).toBeInTheDocument()
  expect(screen.getByText('Ben Lim')).toBeInTheDocument()
})
it('draft Continue setup opens structure and scoring before contestants', async () => {
  pageantService.listEvents.mockResolvedValue({ data: { events: [{ id: 'e', title: 'New competition', status: 'draft' }] } })
  render(<MemoryRouter><CompetitionEventsPage /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: 'Continue setup' })).toHaveAttribute('href', '/organizer/competition/events/e/workspace')
})
