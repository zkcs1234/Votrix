import api from '@/services/api'

const base = '/admin'

export const adminService = {
  getDashboard() {
    return api.get(`${base}/dashboard`)
  },
  getAnalytics() {
    return api.get(`${base}/analytics`)
  },
  getOrganizers() {
    return api.get(`${base}/organizers`)
  },
  createOrganizer(data) {
    return api.post(`${base}/organizers`, data)
  },
  updateOrganizerStatus(organizerId, accountStatus) {
    return api.patch(`${base}/organizers/${organizerId}/status`, { accountStatus })
  },
  getGlobalEvents() {
    return api.get(`${base}/events`)
  },
  getSystemSettings() {
    return api.get(`${base}/settings`)
  },
  updateSystemSetting(data) {
    return api.put(`${base}/settings`, data)
  },
  getAuditLogs() {
    return api.get(`${base}/audit-logs`)
  }
}
