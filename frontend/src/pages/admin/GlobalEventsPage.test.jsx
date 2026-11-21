import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GlobalEventsPage from './GlobalEventsPage'

const mocks = vi.hoisted(() => ({
  getGlobalEvents: vi.fn(),
  exportEvents: vi.fn(),
  restoreEvent: vi.fn(),
  getEventParticipants: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/services/admin.service', () => ({
  adminService: {
    getGlobalEvents: mocks.getGlobalEvents,
    exportEvents: mocks.exportEvents,
    restoreEvent: mocks.restoreEvent,
    getEventParticipants: mocks.getEventParticipants,
  },
}))

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('event details list the enrolled participants', async () => {
  mocks.getGlobalEvents.mockResolvedValueOnce({
    data: { events: [{ id: 'e1', title: 'Student Council 2026', event_type: 'election', status: 'active', organizations: { organization_name: 'SSC' } }] },
  })
  mocks.getEventParticipants.mockResolvedValueOnce({
    data: {
      participants: [
        { userId: 'u1', email: 'ana@school.edu', firstName: 'Ana', lastName: 'Cruz', schoolId: '2024-001', participantType: 'STUDENT', hasVoted: true },
        { userId: 'u2', email: 'ben@school.edu', firstName: 'Ben', lastName: 'Lee', schoolId: '2024-002', participantType: 'STUDENT', hasVoted: false },
      ],
      summary: { total: 2, voted: 1, scored: 0, responded: 0, truncated: false },
    },
  })

  render(<MemoryRouter><GlobalEventsPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'View details for Student Council 2026' }))

  expect(await screen.findByText('Ana Cruz')).toBeInTheDocument()
  expect(screen.getByText('ben@school.edu')).toBeInTheDocument()
  expect(mocks.getEventParticipants).toHaveBeenCalledWith('e1')
  expect(screen.getByText('Not yet')).toBeInTheDocument()
})

test('shows global-event load errors and allows retry', async () => {
  mocks.getGlobalEvents
    .mockRejectedValueOnce({ response: { status: 503, data: { message: 'Event service unavailable' } } })
    .mockResolvedValueOnce({ data: { events: [] } })

  render(<MemoryRouter><GlobalEventsPage /></MemoryRouter>)

  expect(await screen.findByText('Event service unavailable')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading events' }))
  expect(await screen.findByText('No events match your current filters.')).toBeInTheDocument()
  expect(mocks.getGlobalEvents).toHaveBeenCalledTimes(2)
})
