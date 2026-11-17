import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePlatformSync } from './usePlatformSync'
import { DEFAULT_PLATFORM_NAME, usePlatformStore } from '@/store/platform.store'
import { platformService } from '@/services/platform.service'

vi.mock('@/services/platform.service', () => ({ platformService: { get: vi.fn() } }))

beforeEach(() => {
  vi.resetAllMocks()
  usePlatformStore.setState({ platformName: DEFAULT_PLATFORM_NAME, maintenanceMode: false, loaded: false })
  document.title = 'something else'
})
afterEach(() => vi.useRealTimers())

describe('usePlatformSync', () => {
  it('loads the platform settings and puts the name in the browser tab', async () => {
    platformService.get.mockResolvedValue({ data: { platformName: 'BISU Votes', maintenanceMode: false } })
    renderHook(() => usePlatformSync())

    await waitFor(() => expect(usePlatformStore.getState().platformName).toBe('BISU Votes'))
    expect(document.title).toBe('BISU Votes')
    expect(usePlatformStore.getState().loaded).toBe(true)
  })

  it('picks up maintenance mode being switched on or off', async () => {
    platformService.get.mockResolvedValue({ data: { platformName: 'Votrix', maintenanceMode: true } })
    renderHook(() => usePlatformSync())
    await waitFor(() => expect(usePlatformStore.getState().maintenanceMode).toBe(true))
  })

  it('keeps the tab title in step when the name changes later (e.g. the admin saves a new one)', async () => {
    platformService.get.mockResolvedValue({ data: { platformName: 'Votrix', maintenanceMode: false } })
    renderHook(() => usePlatformSync())
    await waitFor(() => expect(document.title).toBe('Votrix'))

    act(() => usePlatformStore.getState().apply({ platformName: 'Renamed' }))
    expect(document.title).toBe('Renamed')
  })

  it('keeps what it has when the server cannot be reached', async () => {
    platformService.get.mockRejectedValue(new Error('offline'))
    usePlatformStore.getState().apply({ platformName: 'Known', maintenanceMode: false })
    renderHook(() => usePlatformSync())

    await waitFor(() => expect(platformService.get).toHaveBeenCalled())
    await act(async () => {})
    expect(usePlatformStore.getState().platformName).toBe('Known')
  })

  it('re-checks when the tab becomes visible and every minute, and stops on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    platformService.get.mockResolvedValue({ data: { platformName: 'Votrix', maintenanceMode: false } })
    const { unmount } = renderHook(() => usePlatformSync())
    await act(async () => {})
    expect(platformService.get).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(platformService.get).toHaveBeenCalledTimes(2)

    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(platformService.get).toHaveBeenCalledTimes(3)

    unmount()
    await act(async () => { vi.advanceTimersByTime(180_000) })
    expect(platformService.get).toHaveBeenCalledTimes(3)
  })
})
