import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MaintenanceGate from './MaintenanceGate'
import { DEFAULT_PLATFORM_NAME, usePlatformStore } from '@/store/platform.store'
import { useAuthStore } from '@/store/auth.store'
import { authService } from '@/services/auth.service'

vi.mock('@/services/auth.service', () => ({ authService: { logout: vi.fn() } }))

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<MaintenanceGate />}>
          <Route path="/" element={<p>Sign-in page</p>} />
          <Route path="/login" element={<p>Sign-in page</p>} />
          <Route path="/participant" element={<p>Student area</p>} />
          <Route path="/organizer/apply/:token" element={<p>Public apply page</p>} />
          <Route path="/admin" element={<p>Admin area</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

const signIn = (role) => useAuthStore.setState({ user: { id: 'u1', role }, isAuthenticated: true, isBootstrapping: false })

beforeEach(() => {
  vi.resetAllMocks()
  usePlatformStore.setState({ platformName: DEFAULT_PLATFORM_NAME, maintenanceMode: false, loaded: true })
  useAuthStore.setState({ user: null, isAuthenticated: false, isBootstrapping: false })
})

describe('MaintenanceGate', () => {
  it('does nothing while maintenance mode is off', () => {
    signIn('participant')
    renderAt('/participant')
    expect(screen.getByText('Student area')).toBeInTheDocument()
  })

  it('shows the maintenance screen to a signed-in non-admin, naming the platform', () => {
    usePlatformStore.setState({ maintenanceMode: true, platformName: 'BISU Votes' })
    signIn('participant')
    renderAt('/participant')

    expect(screen.getByRole('heading', { name: 'BISU Votes is under maintenance' })).toBeInTheDocument()
    expect(screen.queryByText('Student area')).not.toBeInTheDocument()
    expect(screen.getByText(/Only administrators can sign in/)).toBeInTheDocument()
  })

  it.each(['organizer', 'participant', 'voter'])('also blocks a signed-in %s', (role) => {
    usePlatformStore.setState({ maintenanceMode: true })
    signIn(role)
    renderAt('/participant')
    expect(screen.getByRole('heading', { name: /under maintenance/ })).toBeInTheDocument()
  })

  it('blocks signed-out visitors from public pages too', () => {
    usePlatformStore.setState({ maintenanceMode: true })
    renderAt('/organizer/apply/abc')
    expect(screen.getByRole('heading', { name: /under maintenance/ })).toBeInTheDocument()
    expect(screen.queryByText('Public apply page')).not.toBeInTheDocument()
  })

  it('keeps the sign-in pages reachable so an administrator can get back in', () => {
    usePlatformStore.setState({ maintenanceMode: true })
    renderAt('/login')
    expect(screen.getByText('Sign-in page')).toBeInTheDocument()
  })

  it('lets administrators through everywhere', () => {
    usePlatformStore.setState({ maintenanceMode: true })
    signIn('admin')
    renderAt('/admin')
    expect(screen.getByText('Admin area')).toBeInTheDocument()
  })

  it('reacts the moment maintenance is switched on or off', () => {
    signIn('participant')
    renderAt('/participant')
    expect(screen.getByText('Student area')).toBeInTheDocument()

    usePlatformStore.getState().setMaintenance(true)
    return waitFor(() => expect(screen.getByRole('heading', { name: /under maintenance/ })).toBeInTheDocument()).then(() => {
      usePlatformStore.getState().setMaintenance(false)
      return waitFor(() => expect(screen.getByText('Student area')).toBeInTheDocument())
    })
  })
})

describe('MaintenanceScreen actions', () => {
  it('offers a signed-in non-admin a Sign out button that ends the session', async () => {
    usePlatformStore.setState({ maintenanceMode: true })
    signIn('participant')
    authService.logout.mockResolvedValue({})
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })

    renderAt('/participant')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(authService.logout).toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('offers a signed-out visitor an Administrator sign in link', () => {
    usePlatformStore.setState({ maintenanceMode: true })
    renderAt('/organizer/apply/abc')
    expect(screen.getByRole('link', { name: 'Administrator sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })
})
