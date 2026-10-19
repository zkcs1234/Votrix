import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ post: vi.fn(), request: vi.fn(), requestInterceptor: null, responseError: null, session: null, setSession: vi.fn(), clearSession: vi.fn() }))
vi.mock('axios', () => ({ default: { post: mocks.post, get: vi.fn(), create: () => {
  const api = mocks.request
  api.interceptors = { request: { use: fn => { mocks.requestInterceptor = fn } }, response: { use: (_success, error) => { mocks.responseError = error } } }
  return api
} } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: mocks.session, setSession: mocks.setSession, clearSession: mocks.clearSession }) } }))
vi.mock('@/store/toast.store', () => ({ useToastStore: { getState: () => ({ error: vi.fn() }) } }))
vi.mock('@/utils/csrf', () => ({ CSRF_HEADER: 'X-CSRF-Token', getCsrfToken: () => null, setCsrfToken: vi.fn() }))
import { refreshSession } from './api'
import { STORAGE_KEYS } from '@/utils/constants'
beforeEach(() => { vi.clearAllMocks(); mocks.session = { id: 'judge' } })
test('parallel HTTP and socket recovery share one refresh and dispatch cookie-reconnect notification', async () => {
  let finish
  mocks.post.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const refreshed = vi.fn(); window.addEventListener('votrix-token-refreshed', refreshed)
  const first = refreshSession(), second = refreshSession()
  expect(mocks.post).toHaveBeenCalledTimes(1)
  finish({ data: { accessToken: 'fresh-access-token', user: { id: 'judge' }, csrfToken: 'fresh-csrf' } })
  await Promise.all([first, second])
  expect(mocks.setSession).toHaveBeenCalledTimes(1)
  expect(mocks.setSession).toHaveBeenCalledWith({ user: { id: 'judge' }, csrfToken: 'fresh-csrf' })
  expect(refreshed).toHaveBeenCalledTimes(1)
  window.removeEventListener('votrix-token-refreshed', refreshed)
})

test('retried requests remove the legacy bearer header and ignore local access tokens', async () => {
  const config = { method: 'get', url: '/auth/me', headers: { Authorization: 'Bearer expired-token' } }
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'fresh-access-token')
  try {
    const request = await mocks.requestInterceptor(config)
    expect(request.headers).not.toHaveProperty('Authorization')
  } finally {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
  }
})
test('late refresh cannot restore an account replaced during the request', async () => {
  let finish
  mocks.post.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = refreshSession()
  mocks.session = { id: 'different-judge' }
  finish({ data: { user: { id: 'judge' } } })
  await expect(pending).rejects.toMatchObject({ staleIdentity: true })
  expect(mocks.setSession).not.toHaveBeenCalled()
  expect(mocks.clearSession).not.toHaveBeenCalled()
})
test('network failure retains identity and local work, while invalid refresh session clears authentication', async () => {
  mocks.post.mockRejectedValueOnce(new Error('Network unavailable'))
  await expect(refreshSession()).rejects.toThrow('Network unavailable')
  expect(mocks.clearSession).not.toHaveBeenCalled()
  mocks.post.mockRejectedValueOnce({ response: { status: 401 } })
  await expect(refreshSession()).rejects.toMatchObject({ response: { status: 401 } })
  expect(mocks.clearSession).toHaveBeenCalledTimes(1)
})
test('late unauthorized response from an earlier account cannot refresh or clear the current account', async () => {
  mocks.session = { id: 'different-judge' }
  const error = { config: { url: '/participant/competition/events/event/session-view', _authIdentity: 'judge' }, response: { status: 401 } }
  await expect(mocks.responseError(error)).rejects.toBe(error)
  expect(mocks.post).not.toHaveBeenCalled()
  expect(mocks.clearSession).not.toHaveBeenCalled()
})
