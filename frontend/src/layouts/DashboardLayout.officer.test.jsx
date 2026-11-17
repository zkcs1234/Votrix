import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'

// Real DashboardLayout + AppShell; only the network/realtime edges are stubbed
// (same approach as PageantLayout.navigation.test.jsx).
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

const officership = { organizerId: 'org-1', organizationName: 'Computing Society', organizerName: 'Ada', position: 'President' }

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/organizer/*" element={<DashboardLayout title="Organizer" />}>
          <Route path="*" element={<p>Organizer page</p>} />
        </Route>
        <Route path="/participant" element={<DashboardLayout title="Participant" />}>
          <Route index element={<p>Student page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const sidebarLinks = () => screen.getAllByRole('link').map((a) => [a.textContent.trim(), a.getAttribute('href')])
const hasLink = (label, href) => sidebarLinks().some(([text, to]) => text.includes(label) && (href === undefined || to === href))

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
})

describe('DashboardLayout for a student officer inside /organizer', () => {
  beforeEach(() => {
    user = { id: 's1', role: 'participant', email: 's1@example.com', officership }
  })

  it('shows the officer banner with the position and organization', () => {
    renderAt('/organizer')
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('President')
    expect(banner).toHaveTextContent('Computing Society')
    expect(banner).toHaveTextContent(/recorded under your name/i)
    expect(within(banner).getByRole('link', { name: /Back to student view/ })).toHaveAttribute('href', '/participant')
  })

  it('renders the organizer navigation, labels the account "Officer", and offers a way back', () => {
    renderAt('/organizer')
    expect(hasLink('Reports', '/organizer/reports')).toBe(true)
    expect(hasLink('Student view', '/participant')).toBe(true)
    expect(screen.getByText('Officer')).toBeInTheDocument()
  })

  it('does not offer the owner-only Account Manager', () => {
    renderAt('/organizer')
    expect(hasLink('Account Manager')).toBe(false)
  })
})

describe('DashboardLayout for the owner organizer', () => {
  beforeEach(() => {
    user = { id: 'o1', role: 'organizer', email: 'org@example.com', organizationName: 'Computing Society' }
  })

  it('offers the Account Manager and no officer UI', () => {
    renderAt('/organizer')
    expect(hasLink('Account Manager', '/organizer/officers')).toBe(true)
    expect(hasLink('Student view')).toBe(false)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('DashboardLayout on the student pages', () => {
  it('gives an officer an entry into the workspace, without the banner', () => {
    user = { id: 's1', role: 'participant', email: 's1@example.com', officership }
    renderAt('/participant')
    expect(hasLink('Open workspace', '/organizer')).toBe(true)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(hasLink('Reports')).toBe(false)
  })

  it('shows a plain student nothing about organizing', () => {
    user = { id: 's2', role: 'participant', email: 's2@example.com', officership: null }
    renderAt('/participant')
    expect(hasLink('Open workspace')).toBe(false)
    expect(hasLink('Student view')).toBe(false)
    expect(hasLink('Account Manager')).toBe(false)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
