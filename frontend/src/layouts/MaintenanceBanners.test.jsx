import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AuthLayout from './AuthLayout'
import DashboardLayout from './DashboardLayout'
import { DEFAULT_PLATFORM_NAME, usePlatformStore } from '@/store/platform.store'

// Same stubs as the other layout tests: only the network/realtime edges.
let user
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user, role: user?.role, clearSession: vi.fn() }) }))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))
vi.mock('@/services/notifications.service', () => ({ notificationsService: { getUnreadCount: async () => ({ data: { unreadCount: 0 } }) } }))
vi.mock('@/services/auth.service', () => ({ authService: { getMe: vi.fn(async () => ({ data: { user: null } })), logout: vi.fn() } }))
vi.mock('@/components/ui/GlobalSearch', () => ({ default: () => null }))
vi.mock('@/components/ui/NotificationsModal', () => ({ default: () => null }))
vi.mock('@/components/organizer/ProfileCard', () => ({ default: () => null }))

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
  usePlatformStore.setState({ platformName: DEFAULT_PLATFORM_NAME, maintenanceMode: false, loaded: true })
})

const signIn = (role) => { user = { id: 'u1', role, email: `${role}@x.test` } }

describe('sign-in pages', () => {
  const renderAuth = () =>
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes><Route element={<AuthLayout />}><Route path="/login" element={<p>Login form</p>} /></Route></Routes>
      </MemoryRouter>,
    )

  it('say nothing special normally', () => {
    renderAuth()
    expect(screen.getByText('Login form')).toBeInTheDocument()
    expect(screen.queryByText(/Maintenance mode is on/)).not.toBeInTheDocument()
  })

  it('tell people only administrators can sign in while maintenance mode is on', () => {
    usePlatformStore.setState({ maintenanceMode: true })
    renderAuth()
    expect(screen.getByRole('status')).toHaveTextContent('Only administrators can sign in right now')
    expect(screen.getByText('Login form')).toBeInTheDocument()
  })

  it('show the custom platform name in the logo', () => {
    usePlatformStore.setState({ platformName: 'BISU Votes' })
    renderAuth()
    expect(screen.getByText('BISU Votes')).toBeInTheDocument()
  })
})

describe('admin layout', () => {
  const renderAdmin = () =>
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes><Route path="/admin" element={<DashboardLayout title="Admin" />}><Route index element={<p>Admin page</p>} /></Route></Routes>
      </MemoryRouter>,
    )

  it('reminds administrators when maintenance mode is on, with a way to turn it off', () => {
    usePlatformStore.setState({ maintenanceMode: true })
    signIn('admin')
    renderAdmin()
    expect(screen.getByRole('status')).toHaveTextContent('Maintenance mode is on')
    expect(screen.getByRole('link', { name: 'Turn it off' })).toHaveAttribute('href', '/admin/settings')
  })

  it('shows nothing when it is off', () => {
    signIn('admin')
    renderAdmin()
    expect(screen.queryByText(/Maintenance mode is on/)).not.toBeInTheDocument()
  })

  it('puts the platform name in the sidebar logo', () => {
    usePlatformStore.setState({ platformName: 'BISU Votes' })
    signIn('admin')
    renderAdmin()
    expect(screen.getAllByText('BISU Votes').length).toBeGreaterThan(0)
    expect(screen.queryByText(/VOTRIX/)).not.toBeInTheDocument()
  })

  it('updates the sidebar logo live when the name is saved', () => {
    signIn('admin')
    renderAdmin()
    expect(screen.getByRole('link', { name: `${DEFAULT_PLATFORM_NAME} home` })).toBeInTheDocument()
    act(() => usePlatformStore.getState().apply({ platformName: 'Renamed' }))
    expect(screen.getByRole('link', { name: 'Renamed home' })).toBeInTheDocument()
  })

  it('does not show the notice to other roles', () => {
    usePlatformStore.setState({ maintenanceMode: true })
    signIn('organizer')
    renderAdmin()
    expect(screen.queryByText(/Maintenance mode is on/)).not.toBeInTheDocument()
  })
})
