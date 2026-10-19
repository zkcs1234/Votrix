import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useModuleAnalytics } from './useModuleAnalytics'
import { getAnalyticsProvider } from '../services/registry'
vi.mock('../services/registry', () => ({ getAnalyticsProvider: vi.fn() }))
let provider
beforeEach(() => {
  vi.resetAllMocks()
  provider = { fetchAnalytics: vi.fn().mockResolvedValue({ total: 1 }), fetchReport: vi.fn().mockResolvedValue({ id: 'current' }) }
  getAnalyticsProvider.mockReturnValue(provider)
})
it('reports an independent report failure while preserving successful analytics and offers recoverable refresh', async () => {
  const failure = { response: { status: 403, data: { message: 'Report access denied' } } }
  provider.fetchReport.mockRejectedValueOnce(failure)
  const { result } = renderHook(() => useModuleAnalytics({ moduleId: 'competition', eventId: 'a' }))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.data).toEqual({ total: 1 })
  expect(result.current.error).toBeNull()
  expect(result.current.reportError).toBe(failure)
  await act(() => result.current.refresh())
  expect(result.current.report).toEqual({ id: 'current' })
  expect(result.current.reportError).toBeNull()
})
it('a failed report refresh retains the last successful report instead of fabricating empty data', async () => {
  const { result } = renderHook(() => useModuleAnalytics({ moduleId: 'competition', eventId: 'a' }))
  await waitFor(() => expect(result.current.report).toEqual({ id: 'current' }))
  provider.fetchReport.mockRejectedValueOnce(new Error('Network interrupted'))
  await act(() => result.current.refresh())
  expect(result.current.report).toEqual({ id: 'current' })
  expect(result.current.reportError).toHaveProperty('message', 'Network interrupted')
})
it('switching event starts a fresh read and rejects an obsolete response from the previous event', async () => {
  let resolveOld
  provider.fetchReport.mockImplementation(eventId => eventId === 'a' ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve({ id: eventId }))
  const { result, rerender } = renderHook(({ eventId }) => useModuleAnalytics({ moduleId: 'competition', eventId }), { initialProps: { eventId: 'a' } })
  await waitFor(() => expect(provider.fetchReport).toHaveBeenCalledWith('a'))
  rerender({ eventId: 'b' })
  await waitFor(() => expect(result.current.report).toEqual({ id: 'b' }))
  await act(async () => { resolveOld({ id: 'a' }); await Promise.resolve() })
  expect(result.current.report).toEqual({ id: 'b' })
  expect(result.current.loading).toBe(false)
})
