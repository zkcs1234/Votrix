import api from '@/services/api'

const base = '/admin'

export const adminService = {
  getDashboard() {
    return api.get(`${base}/dashboard`)
  },

  getAnalytics() {
    return api.get(`${base}/analytics`)
  },
}
