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
  updateOrganizer(organizerId, data) {
    return api.patch(`${base}/organizers/${organizerId}`, data)
  },
  updateOrganizerStatus(organizerId, accountStatus) {
    return api.patch(`${base}/organizers/${organizerId}/status`, { accountStatus })
  },
  previewOrganizersCsv(file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${base}/organizers/import-preview`, form)
  },
  registerOrganizersCsv(data) {
    return api.post(`${base}/organizers/import-register`, { data })
  },
  getGlobalEvents() {
    return api.get(`${base}/events`)
  },
  restoreEvent(eventId) {
    return api.patch(`${base}/events/${eventId}/restore`)
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
  getRespondents(params = {}) {
    return api.get(`${base}/respondents`, { params })
  },
  createRespondent(data) {
    return api.post(`${base}/respondents`, data)
  },
  updateRespondent(userId, data) {
    return api.patch(`${base}/respondents/${userId}`, data)
  },
  updateRespondentStatus(userId, accountStatus) {
    return api.patch(`${base}/respondents/${userId}/status`, { accountStatus })
  },
  removeRespondentMembership(userId) {
    return api.delete(`${base}/respondents/${userId}/membership`)
  },
  previewRespondentsCsv(file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${base}/respondents/import-preview`, form)
  },
  registerRespondentsCsv(data) {
    return api.post(`${base}/respondents/import-register`, { data })
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
  removeVoterMembership(userId) {
    return api.delete(`${base}/voters/${userId}/membership`)
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
  removeJudgeMembership(userId) {
    return api.delete(`${base}/judges/${userId}/membership`)
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
  getEmailDeliveryLogs(params = {}) {
    return api.get(`${base}/email-delivery-logs`, { params })
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
  getOrganizerCsvTemplate() {
    return api.get(`${base}/organizers/template`, { responseType: 'blob' })
  },
  getVoterCsvTemplate() {
    return api.get(`${base}/voters/template`, { responseType: 'blob' })
  },
  getRespondentCsvTemplate() {
    return api.get(`${base}/respondents/template`, { responseType: 'blob' })
  },
  getJudgeCsvTemplate() {
    return api.get(`${base}/judges/template`, { responseType: 'blob' })
  },
  exportVoters() {
    return api.get(`${base}/export/voters`, { responseType: 'blob' })
  },
  exportRespondents() {
    return api.get(`${base}/export/respondents`, { responseType: 'blob' })
  },
  exportJudges() {
    return api.get(`${base}/export/judges`, { responseType: 'blob' })
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
