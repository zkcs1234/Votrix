import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/store/auth.store'
import api from './api'
import { organizerApplyService } from './organizer-apply.service'

// The invitation page is public, but every page load also silently restores any
// existing login in the background. When that login lands while the form request
// is in flight, the api client used to discard the (perfectly good) response as
// belonging to "an earlier identity", and the page showed
// "Could not load the application form." for a valid link.

const TOKEN = 'a'.repeat(64)
const FORM = { success: true, email: 'invited@example.com', organizationTypes: [], programs: [] }

// Answers the request, but only after a session has been restored mid-flight.
const slowAdapter = () => async (config) => {
  useAuthStore.setState({ user: { id: 'admin-1', role: 'admin' }, isAuthenticated: true })
  return { data: FORM, status: 200, statusText: 'OK', headers: {}, config }
}

beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false })
})

describe('organizer application form request', () => {
  it('still loads when a login is restored while the request is in flight', async () => {
    const original = api.defaults.adapter
    api.defaults.adapter = slowAdapter()
    try {
      const { data } = await organizerApplyService.getForm(TOKEN)
      expect(data.email).toBe('invited@example.com')
    } finally {
      api.defaults.adapter = original
    }
  })
})
