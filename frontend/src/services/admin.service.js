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
  getAuditLogs(params = {}) {
    return api.get(`${base}/audit-logs`, { params })
  },
  sendOnboardingNotification(organizerId) {
    return api.post(`${base}/organizers/${organizerId}/send-onboarding`)
  },
  getOrganizerActivity(organizerId, params = {}) {
    return api.get(`${base}/organizers/${organizerId}/activity`, { params })
  },
  getSystemHealth() {
    return api.get(`${base}/health`)
  },
  getAlertConfig() {
    return api.get(`${base}/alerts/config`)
  },
  updateAlertConfig(config) {
    return api.put(`${base}/alerts/config`, config)
  },
  exportOrganizers() {
    return api.get(`${base}/export/organizers`, { responseType: 'blob' })
  },
  exportEvents(params = {}) {
    return api.get(`${base}/export/events`, { params, responseType: 'blob' })
  },
  exportAuditLogs(params = {}) {
    return api.get(`${base}/export/audit-logs`, { params, responseType: 'blob' })
  },
  listSessions(params = {}) {
    return api.get(`${base}/sessions`, { params })
  },
  revokeSession(sessionId) {
    return api.delete(`${base}/sessions/${sessionId}`)
  },
  revokeAllUserSessions(userId, exceptSessionId) {
    const params = exceptSessionId ? { exceptSessionId } : {}
    return api.delete(`${base}/users/${userId}/sessions`, { params })
  },
  platformSearch(params = {}) {
    return api.get(`${base}/search`, { params })
  },
  getArchivalPolicy() {
    return api.get(`${base}/policies/archival`)
  },
  updateArchivalPolicy(policy) {
    return api.put(`${base}/policies/archival`, policy)
  },
  runArchivalNow() {
    return api.post(`${base}/policies/archival/run-now`)
  },
}
