import api from '@/services/api'

const base = '/organizer'

export const organizerService = {
  getDashboard() {
    return api.get(`${base}/dashboard`)
  },

  getAnalytics() {
    return api.get(`${base}/analytics`)
  },

  uploadOrganizationLogo(file) {
    const form = new FormData()
    form.append('logo', file)
    return api.post(`${base}/organization/logo`, form)
  },
}
