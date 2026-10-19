import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import ElectionEventsPage from './ElectionEventsPage'
import { electionService } from '@/services/election.service'
import useDraft from '@/hooks/useDraft'

vi.mock('@/services/election.service', () => ({ electionService: {
  listEvents: vi.fn(), getBallotPreview: vi.fn(),
} }))
vi.mock('@/hooks/useDraft', () => ({ default: vi.fn() }))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))

function Location() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

function renderEvents(events) {
  electionService.listEvents.mockResolvedValue({ data: { events } })
  render(<MemoryRouter><ElectionEventsPage /><Location /></MemoryRouter>)
}

beforeEach(() => {
  vi.resetAllMocks()
  useDraft.mockReturnValue({ hasDraft: false, draft: null, deleteDraft: vi.fn() })
})

it.each([0, 1, 2, 8])('renders %i events with existing routes and no extra data requests', async (count) => {
  renderEvents(Array.from({ length: count }, (_, index) => ({
    id: `id-${index}`, title: `Election ${index}`, status: 'active',
  })))
  await screen.findByRole('heading', { name: 'Events' })
  const cards = screen.queryAllByRole('article')
  expect(cards).toHaveLength(count)
  cards.forEach((card, index) => {
    expect(within(card).getByRole('link', { name: 'Manage' }))
      .toHaveAttribute('href', `/organizer/election/events/id-${index}/edit`)
    expect(within(card).getByRole('link', { name: `Election ${index}` }))
      .toHaveAttribute('href', `/organizer/election/events/id-${index}/positions`)
    expect(within(card).getByText('active')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(within(card).queryByText('View')).not.toBeInTheDocument()
  })
  if (!count) expect(screen.getByText('No election events yet.')).toBeInTheDocument()
  for (const link of screen.getAllByRole('link', { name: 'New event' })) {
    expect(link).toHaveAttribute('href', '/organizer/election/events/new')
  }
  expect(electionService.listEvents).toHaveBeenCalledTimes(1)
  expect(electionService.getBallotPreview).not.toHaveBeenCalled()
})

it('keeps draft setup navigation, real descriptions, and status information', async () => {
  renderEvents([{ id: 'draft', title: 'Draft event', status: 'draft',
    description: 'Existing description', electionStatus: 'setup',
  }])
  expect(await screen.findByText('Existing description')).toBeInTheDocument()
  expect(screen.getByText('Setup — not published')).toBeInTheDocument()
  expect(screen.getByText('setup')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continue setup' }))
    .toHaveAttribute('href', '/organizer/election/events/draft/positions')
  expect(screen.getByRole('link', { name: 'Manage' }))
    .toHaveAttribute('href', '/organizer/election/events/draft/edit')
})

it('preserves the selected event ballot preview and close action', async () => {
  electionService.getBallotPreview.mockResolvedValue({ data: { preview: {
    event: { title: 'Selected ballot' }, positions: [],
  } } })
  renderEvents([{ id: 'selected', title: 'Selected event', status: 'completed' }])
  fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
  expect(await screen.findByText('Selected ballot')).toBeInTheDocument()
  expect(electionService.getBallotPreview).toHaveBeenCalledExactlyOnceWith('selected')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByText('Ballot Preview')).not.toBeInTheDocument()
})

it('preserves Open draft navigation and Discard confirmation', async () => {
  const deleteDraft = vi.fn()
  useDraft.mockReturnValue({ hasDraft: true, draft: {
    title: 'Saved event', step: 'details', updatedAt: '2026-10-10T03:00:00Z',
  }, deleteDraft })
  renderEvents([])
  fireEvent.click(await screen.findByRole('button', { name: 'Open draft' }))
  expect(screen.getByTestId('location')).toHaveTextContent('/organizer/election/events/new')
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(screen.getByText('Discard draft?')).toBeInTheDocument()
  expect(deleteDraft).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Keep Draft' }))
  expect(deleteDraft).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard Draft' }))
  expect(deleteDraft).toHaveBeenCalledTimes(1)
})
