import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'

// Real DashboardLayout + AppShell; only the network/realtime edges are stubbed
// (same approach as DashboardLayout.officer.test.jsx).
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'a1', role: 'admin', email: 'admin@example.com' }, role: 'admin', clearSession: vi.fn() }),
}))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))
vi.mock('@/services/notifications.service', () => ({
  notificationsService: { getUnreadCount: async () => ({ data: { unreadCount: 0 } }) },
}))
vi.mock('@/services/auth.service', () => ({ authService: { getMe: vi.fn(), logout: vi.fn() } }))
vi.mock('@/components/ui/GlobalSearch', () => ({ default: () => null }))
vi.mock('@/components/brand/VotrixLogo', () => ({ default: () => <span>Votrix</span> }))
vi.mock('@/components/ui/NotificationsModal', () => ({ default: () => null }))

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<DashboardLayout title="Admin" />}>
          <Route path="*" element={<p>Admin page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const link = (name) => screen.queryByRole('link', { name })

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
})

describe('admin sidebar user entries', () => {
  it('has separate Organizers and Participants entries and no single "User Management"', () => {
    renderAt('/admin')
    expect(link('Organizers')).toHaveAttribute('href', '/admin/organizers')
    expect(link('Participants')).toHaveAttribute('href', '/admin/participants')
    expect(link('User Management')).toBeNull()
  })

  it('highlights only Organizers on the organizers page and its detail page', () => {
    renderAt('/admin/organizers/abc')
    expect(link('Organizers')).toHaveAttribute('aria-current', 'page')
    expect(link('Participants')).not.toHaveAttribute('aria-current')
  })

  it('highlights only Participants on the participants page', () => {
    renderAt('/admin/participants?category=judges')
    expect(link('Participants')).toHaveAttribute('aria-current', 'page')
    expect(link('Organizers')).not.toHaveAttribute('aria-current')
  })
})
