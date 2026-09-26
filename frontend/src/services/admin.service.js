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
  getParticipantTaxonomy() {
    return api.get(`${base}/settings/taxonomy`)
  },
  updateParticipantTaxonomy(taxonomy) {
    return api.put(`${base}/settings/taxonomy`, taxonomy)
  },
  getVoters(params = {}) {
    return api.get(`${base}/voters`, { params })
  },
  createVoter(data) {
    return api.post(`${base}/voters`, data)
  },
  updateVoter(userId, data) {
    return api.patch(`${base}/voters/${userId}`, data)
  },
  updateVoterStatus(userId, accountStatus) {
    return api.patch(`${base}/voters/${userId}/status`, { accountStatus })
  },
  previewVotersCsv(file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${base}/voters/import-preview`, form)
  },
  registerVotersCsv(data) {
    return api.post(`${base}/voters/import-register`, { data })
  },
  getJudges(params = {}) {
    return api.get(`${base}/judges`, { params })
  },
  createJudge(data) {
    return api.post(`${base}/judges`, data)
  },
  updateJudge(userId, data) {
    return api.patch(`${base}/judges/${userId}`, data)
  },
  updateJudgeStatus(userId, accountStatus) {
    return api.patch(`${base}/judges/${userId}/status`, { accountStatus })
  },
  previewJudgesCsv(file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${base}/judges/import-preview`, form)
  },
  registerJudgesCsv(data) {
    return api.post(`${base}/judges/import-register`, { data })
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
