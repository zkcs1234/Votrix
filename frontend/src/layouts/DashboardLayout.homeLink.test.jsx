import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'

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

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/organizer/*" element={<DashboardLayout title="Organizer" />}>
          <Route path="*" element={<p>Page</p>} />
        </Route>
        <Route path="/admin/*" element={<DashboardLayout title="Admin" />}>
          <Route path="*" element={<p>Page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const homeLink = () => screen.queryByRole('link', { name: /Organizer home|administration/ })

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
})

describe('sidebar "back to home" link', () => {
  describe('organizer', () => {
    beforeEach(() => { user = { id: 'o1', role: 'organizer', email: 'o@example.com' } })

    it('is not shown on the organizer dashboard, where it would point at the same page', () => {
      renderAt('/organizer')
      expect(homeLink()).toBeNull()
    })

    it('is not shown with a trailing slash either', () => {
      renderAt('/organizer/')
      expect(homeLink()).toBeNull()
    })

    it('is shown on other organizer pages', () => {
      renderAt('/organizer/reports')
      expect(homeLink()).toHaveAttribute('href', '/organizer')
    })
  })

  describe('admin', () => {
    beforeEach(() => { user = { id: 'a1', role: 'admin', email: 'a@example.com' } })

    it('has no administration link in the sidebar', () => {
      renderAt('/admin')
      expect(homeLink()).toBeNull()
      renderAt('/admin/events')
      expect(homeLink()).toBeNull()
    })
  })
})
