import { afterEach, expect, test } from 'vitest'
import { useAuthStore } from './auth.store'
import { STORAGE_KEYS } from '@/utils/constants'

afterEach(() => useAuthStore.getState().clearSession())

test('login and refresh remove old access tokens without exposing new tokens', () => {
  const user = { id: 'organizer', role: 'organizer' }
  useAuthStore.getState().setSession({ accessToken: 'login-token', user })
  expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull()
  useAuthStore.getState().setSession({ accessToken: 'refreshed-token', user })
  expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull()
  expect(useAuthStore.getState()).not.toHaveProperty('accessToken')
})

test('logout removes the access token and user from localStorage and memory', () => {
  useAuthStore.getState().setSession({ accessToken: 'login-token', user: { id: 'voter' } })
  useAuthStore.getState().clearSession()
  expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull()
  expect(localStorage.getItem(STORAGE_KEYS.USER)).toBeNull()
  expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false })
})
