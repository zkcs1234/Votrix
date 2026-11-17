import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useOfficershipSync } from './useOfficershipSync'
import { useAuthStore } from '@/store/auth.store'
import { authService } from '@/services/auth.service'

const info = vi.fn()
vi.mock('@/store/toast.store', () => ({ useToastStore: { getState: () => ({ info }) } }))
vi.mock('@/services/auth.service', () => ({ authService: { getMe: vi.fn() } }))

const officership = { organizerId: 'org-1', organizationName: 'Computing Society', position: 'President' }
const student = (o = officership) => ({ id: 's1', role: 'participant', email: 's1@example.com', officership: o })

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ user: student(), isAuthenticated: true, isBootstrapping: false })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useOfficershipSync', () => {
  it('clears the officership in the store and tells the user when it ended', async () => {
    authService.getMe.mockResolvedValue({ data: { user: student(null) } })
    renderHook(() => useOfficershipSync(true))

    await waitFor(() => expect(useAuthStore.getState().user.officership).toBeNull())
    expect(info).toHaveBeenCalledWith('Your officer access has ended.')
  })

  it('picks up a changed position without any message', async () => {
    authService.getMe.mockResolvedValue({ data: { user: student({ ...officership, position: 'Treasurer' }) } })
    renderHook(() => useOfficershipSync(true))

    await waitFor(() => expect(useAuthStore.getState().user.officership.position).toBe('Treasurer'))
    expect(info).not.toHaveBeenCalled()
  })

  it('leaves the store untouched when nothing changed', async () => {
    const before = useAuthStore.getState().user
    authService.getMe.mockResolvedValue({ data: { user: student() } })
    renderHook(() => useOfficershipSync(true))

    await waitFor(() => expect(authService.getMe).toHaveBeenCalled())
    await act(async () => {})
    expect(useAuthStore.getState().user).toBe(before)
    expect(info).not.toHaveBeenCalled()
  })

  it('ignores a response for a different account (e.g. after switching users)', async () => {
    authService.getMe.mockResolvedValue({ data: { user: { ...student(null), id: 'someone-else' } } })
    renderHook(() => useOfficershipSync(true))

    await waitFor(() => expect(authService.getMe).toHaveBeenCalled())
    await act(async () => {})
    expect(useAuthStore.getState().user.officership).toEqual(officership)
  })

  it('does nothing when disabled', async () => {
    renderHook(() => useOfficershipSync(false))
    await act(async () => {})
    expect(authService.getMe).not.toHaveBeenCalled()
  })

  it('swallows network errors', async () => {
    authService.getMe.mockRejectedValue(new Error('offline'))
    renderHook(() => useOfficershipSync(true))

    await waitFor(() => expect(authService.getMe).toHaveBeenCalled())
    expect(useAuthStore.getState().user.officership).toEqual(officership)
  })

  it('re-checks when the tab becomes visible again and on an interval, and stops on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    authService.getMe.mockResolvedValue({ data: { user: student() } })
    const { unmount } = renderHook(() => useOfficershipSync(true))
    await act(async () => {})
    expect(authService.getMe).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(authService.getMe).toHaveBeenCalledTimes(2)

    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(authService.getMe).toHaveBeenCalledTimes(3)

    unmount()
    await act(async () => { vi.advanceTimersByTime(120_000) })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(authService.getMe).toHaveBeenCalledTimes(3)
  })
})
