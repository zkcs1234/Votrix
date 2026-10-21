import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AuditLogsPage from './AuditLogsPage'

const mocks = vi.hoisted(() => ({ getAuditLogs: vi.fn() }))

vi.mock('@/services/admin.service', () => ({
  adminService: { getAuditLogs: mocks.getAuditLogs },
}))

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('loads and clears entity filters supplied by a global-event activity link', async () => {
  mocks.getAuditLogs.mockResolvedValue({
    data: { logs: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } },
  })

  render(
    <MemoryRouter initialEntries={['/admin/audit-logs?entity=events&entityId=event-123']}>
      <AuditLogsPage />
    </MemoryRouter>,
  )

  await waitFor(() => {
    expect(mocks.getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({
      entity: 'events',
      entityId: 'event-123',
    }))
  })

  fireEvent.click(screen.getByRole('button', { name: 'Clear2' }))

  await waitFor(() => {
    expect(mocks.getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({
      entity: undefined,
      entityId: undefined,
    }))
  })
})
