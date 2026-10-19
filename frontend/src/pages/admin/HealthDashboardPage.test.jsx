import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import HealthDashboardPage from './HealthDashboardPage'

const mocks = vi.hoisted(() => ({ getSystemHealth: vi.fn() }))

vi.mock('@/services/admin.service', () => ({
  adminService: { getSystemHealth: mocks.getSystemHealth },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test.each([
  [true, 'Ready'],
  [false, 'Needs migrations'],
  [null, 'Not reported'],
])('reports database schema readiness as %s', async (schemaReady, expectedLabel) => {
  mocks.getSystemHealth.mockResolvedValue({
    data: {
      overall: 'healthy',
      checkedAt: '2026-10-26T08:00:00.000Z',
      services: [
        { service: 'database', status: 'healthy', schemaReady },
        { service: 'cloudinary', status: 'healthy' },
        { service: 'resend', status: 'healthy' },
      ],
    },
  })

  render(<HealthDashboardPage />)

  expect(await screen.findByRole('heading', { name: 'Database schema readiness' })).toBeInTheDocument()
  expect(screen.getByText(expectedLabel)).toBeInTheDocument()
})
