import api from '@/services/api'

export const authService = {
  adminLogin(credentials) {
    return api.post('/auth/admin/login', credentials)
  },

  organizerLogin(credentials) {
    return api.post('/auth/organizer/login', credentials)
  },

  voterLogin(credentials) {
    return api.post('/auth/voter/login', credentials)
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
    return api.post('/auth/change-password', payload)
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
