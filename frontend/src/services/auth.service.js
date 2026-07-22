import axios from 'axios'
import api from '@/services/api'
import { API_BASE_URL } from '@/utils/constants'
import { CSRF_HEADER, clearCsrfToken, setCsrfToken } from '@/utils/csrf'

async function ensureFreshCsrfToken() {
  clearCsrfToken()

  const { data } = await axios.get(`${API_BASE_URL}/auth/csrf`, {
    withCredentials: true,
    params: { t: Date.now() },
  })

  if (data.csrfToken) {
    setCsrfToken(data.csrfToken)
    return data.csrfToken
  }

  return null
}

export const authService = {
  // Unified login - works for admin, organizer, and voter
  login(credentials) {
    return api.post('/auth/login', credentials)
  },

  refresh() {
    return api.post('/auth/refresh')
  },

  logout() {
    return api.post('/auth/logout')
  },

  getMe() {
    return api.get('/auth/me')
  },

  changePassword(payload) {
    return ensureFreshCsrfToken().then((csrfToken) =>
      api.post('/auth/change-password', payload, {
        headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : undefined,
      }),
    )
  },

  skipPasswordChange() {
    return ensureFreshCsrfToken().then((csrfToken) =>
      api.post('/auth/skip-password-change', {}, {
        headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : undefined,
      }),
    )
  },

  createOrganizer(payload) {
    return api.post('/admin/organizers', payload)
  },

  forgotPassword(payload) {
    return api.post('/auth/forgot-password', payload)
  },

  resetPassword(payload) {
    return api.post('/auth/reset-password', payload)
  },
}
