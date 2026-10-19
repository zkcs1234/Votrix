import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PollingEventsPage from './PollingEventsPage'
import { pollingService } from '@/services/polling.service'

vi.mock('@/services/polling.service', () => ({
  pollingService: {
    listEvents: vi.fn(),
    listQuestions: vi.fn(),
  },
}))
vi.mock('@/hooks/useDraft', () => ({
  default: () => ({ hasDraft: false, draft: null, deleteDraft: vi.fn() }),
}))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
})

it('shows an actionable empty state when there are no polls', async () => {
  pollingService.listEvents.mockResolvedValue({ data: { events: [] } })

  render(<MemoryRouter><PollingEventsPage /></MemoryRouter>)

  expect(await screen.findByText('No polls yet.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'New poll' }))
    .toHaveAttribute('href', '/organizer/polling/events/new')
})

it('preserves draft setup routes and loads the selected poll preview', async () => {
  pollingService.listEvents.mockResolvedValue({
    data: { events: [{ id: 'poll-1', title: 'Student survey', status: 'draft' }] },
  })
  pollingService.listQuestions.mockResolvedValue({
    data: { questions: [{ id: 'question-1', question: 'Which option?', type: 'single_choice', options: [] }] },
  })

  render(<MemoryRouter><PollingEventsPage /></MemoryRouter>)

  const eventCard = await screen.findByRole('article')
  expect(within(eventCard).getByRole('link', { name: 'Student survey' }))
    .toHaveAttribute('href', '/organizer/polling/events/poll-1/builder')
  expect(within(eventCard).getByRole('link', { name: 'Continue setup' }))
    .toHaveAttribute('href', '/organizer/polling/events/poll-1/builder')
  expect(within(eventCard).getByRole('link', { name: 'Edit' }))
    .toHaveAttribute('href', '/organizer/polling/events/poll-1/edit')

  fireEvent.click(within(eventCard).getByRole('button', { name: 'Preview' }))

  expect(await screen.findByRole('heading', { name: /Which option\?/ })).toBeInTheDocument()
  expect(pollingService.listQuestions).toHaveBeenCalledExactlyOnceWith('poll-1')
})
