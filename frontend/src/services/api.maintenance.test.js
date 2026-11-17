import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import api, { refreshSession } from './api'
import { DEFAULT_PLATFORM_NAME, usePlatformStore } from '@/store/platform.store'
import { useToastStore } from '@/store/toast.store'

// A request whose adapter fails like the server would: HTTP status + JSON body.
const failing = (status, data) => async (config) => {
  const error = new Error(`Request failed with status code ${status}`)
  error.config = config
  error.response = { status, data, headers: {}, config }
  throw error
}

beforeEach(() => {
  usePlatformStore.setState({ platformName: DEFAULT_PLATFORM_NAME, maintenanceMode: false, loaded: true })
  useToastStore.setState({ toasts: [] })
})

describe('API client and maintenance mode', () => {
  it('flips the app into maintenance when the server answers MAINTENANCE_MODE, without an error toast', async () => {
    const error = vi.spyOn(useToastStore.getState(), 'error')
    await expect(
      api.get('/organizer/overview', { adapter: failing(503, { success: false, code: 'MAINTENANCE_MODE', message: 'down' }) }),
    ).rejects.toBeTruthy()

    expect(usePlatformStore.getState().maintenanceMode).toBe(true)
    expect(error).not.toHaveBeenCalled()
  })

  it('also notices maintenance when restoring a session on page load (the refresh call)', async () => {
    // Restoring a session uses a separate request path from ordinary API calls.
    const post = vi.spyOn(axios, 'post').mockRejectedValue(
      Object.assign(new Error('503'), { response: { status: 503, data: { code: 'MAINTENANCE_MODE' } } }),
    )
    await expect(refreshSession()).rejects.toBeTruthy()

    expect(usePlatformStore.getState().maintenanceMode).toBe(true)
    post.mockRestore()
  })

  it('ignores an ordinary 503 (a real outage is not "maintenance mode")', async () => {
    await expect(api.get('/organizer/overview', { adapter: failing(503, { success: false, message: 'upstream down' }) })).rejects.toBeTruthy()
    expect(usePlatformStore.getState().maintenanceMode).toBe(false)
  })

  it('ignores other errors that merely carry the same code on a different status', async () => {
    await expect(api.get('/x', { adapter: failing(500, { code: 'MAINTENANCE_MODE' }) })).rejects.toBeTruthy()
    expect(usePlatformStore.getState().maintenanceMode).toBe(false)
  })
})
