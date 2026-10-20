import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GlobalEventsPage from './GlobalEventsPage'

const mocks = vi.hoisted(() => ({
  getGlobalEvents: vi.fn(),
  exportEvents: vi.fn(),
  restoreEvent: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/services/admin.service', () => ({
  adminService: {
    getGlobalEvents: mocks.getGlobalEvents,
    exportEvents: mocks.exportEvents,
    restoreEvent: mocks.restoreEvent,
  },
}))

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
