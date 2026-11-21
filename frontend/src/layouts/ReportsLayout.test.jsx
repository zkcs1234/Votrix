import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ReportsLayout from './ReportsLayout'

let user
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user, role: user.role, clearSession: vi.fn() }),
}))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))
vi.mock('@/services/notifications.service', () => ({
  notificationsService: { getUnreadCount: async () => ({ data: { unreadCount: 0 } }) },
}))
vi.mock('@/services/auth.service', () => ({
  authService: { getMe: vi.fn(async () => ({ data: { user: null } })), logout: vi.fn() },
}))
vi.mock('@/components/ui/GlobalSearch', () => ({ default: () => null }))
vi.mock('@/components/brand/VotrixLogo', () => ({ default: () => <span>Votrix</span> }))
vi.mock('@/components/ui/NotificationsModal', () => ({ default: () => null }))
vi.mock('@/components/organizer/ProfileCard', () => ({ default: () => null }))

function renderReports() {
  return render(
    <MemoryRouter initialEntries={['/organizer/reports']}>
      <Routes>
        <Route path="/organizer/reports" element={<ReportsLayout />}>
          <Route index element={<p>Reports page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
})

describe('Reports sidebar', () => {
  it('keeps Account Manager for the organizer', () => {
    user = { id: 'o1', role: 'organizer', email: 'o@example.com' }
    renderReports()
    expect(screen.getByRole('link', { name: 'Account Manager' })).toHaveAttribute('href', '/organizer/officers')
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not show Account Manager to a student officer', () => {
    user = { id: 's1', role: 'participant', email: 's@example.com' }
    renderReports()
    expect(screen.queryByRole('link', { name: 'Account Manager' })).toBeNull()
  })
})
