import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminDashboardPage from './AdminDashboardPage'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: { getDashboard: vi.fn(), getAnalytics: vi.fn() },
}))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  adminService.getDashboard.mockResolvedValue({ data: {} })
  adminService.getAnalytics.mockResolvedValue({ data: {} })
})

describe('Admin Dashboard', () => {
  it('has no shortcut actions or operational health card', async () => {
    render(<MemoryRouter><AdminDashboardPage /></MemoryRouter>)

    await screen.findByText('Admin Dashboard')
    expect(screen.queryByText(/Invite organizer/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Add participant/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Operational health/i)).not.toBeInTheDocument()
  })
})
