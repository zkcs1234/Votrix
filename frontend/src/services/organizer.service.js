import api from '@/services/api'

const base = '/organizer'

export const organizerService = {
  getDashboard() {
    return api.get(`${base}/dashboard`)
  },

  getAnalytics() {
    return api.get(`${base}/analytics`)
  },
}
