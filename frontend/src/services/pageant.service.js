import api from '@/services/api'

// Two base paths are kept in sync so existing call sites continue to work
// while the rest of the app migrates from `/pageant` to `/competition`.
const org = '/organizer/competition'
const orgLegacy = '/organizer/pageant'
const judge = '/voter/competition'
const judgeLegacy = '/voter/pageant'

export const pageantService = {
  getDashboard() {
    return api.get(`${org}/dashboard`)
  },

  uploadOrganizationLogo(file) {
    const form = new FormData()
    form.append('logo', file)
    return api.post(`${org}/organization/logo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  listEvents() {
    return api.get(`${org}/events`)
  },

  createEvent(payload) {
    return api.post(`${org}/events`, payload)
  },

  getEvent(eventId) {
    return api.get(`${org}/events/${eventId}`)
  },

  updateEvent(eventId, payload) {
    return api.patch(`${org}/events/${eventId}`, payload)
  },

  setScoring(eventId, scoringEnabled) {
    return api.patch(`${org}/events/${eventId}/scoring`, { scoringEnabled })
  },

  uploadBanner(eventId, file) {
    const form = new FormData()
    form.append('banner', file)
    return api.post(`${org}/events/${eventId}/banner`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  listContestants(eventId) {
    return api.get(`${org}/events/${eventId}/contestants`)
  },

  createContestant(eventId, payload) {
    return api.post(`${org}/events/${eventId}/contestants`, payload)
  },

  updateContestant(eventId, contestantId, payload) {
    return api.patch(`${org}/events/${eventId}/contestants/${contestantId}`, payload)
  },

  deleteContestant(eventId, contestantId) {
    return api.delete(`${org}/events/${eventId}/contestants/${contestantId}`)
  },

  uploadContestantPhoto(eventId, contestantId, file) {
    const form = new FormData()
    form.append('photo', file)
    return api.post(`${org}/events/${eventId}/contestants/${contestantId}/photo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  listCriteria(eventId) {
    return api.get(`${org}/events/${eventId}/criteria`)
  },

  createCriteria(eventId, payload) {
    return api.post(`${org}/events/${eventId}/criteria`, payload)
  },

  updateCriteria(eventId, criteriaId, payload) {
    return api.patch(`${org}/events/${eventId}/criteria/${criteriaId}`, payload)
  },

  deleteCriteria(eventId, criteriaId) {
    return api.delete(`${org}/events/${eventId}/criteria/${criteriaId}`)
  },

  listJudges(eventId) {
    return api.get(`${org}/events/${eventId}/judges`)
  },

  inviteJudge(eventId, payload) {
    return api.post(`${org}/events/${eventId}/judges/invite`, payload)
  },

  importJudgesCsv(eventId, file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${org}/events/${eventId}/judges/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  getRankings(eventId) {
    return api.get(`${org}/events/${eventId}/rankings`)
  },

  getAnalytics(eventId) {
    return api.get(`${org}/events/${eventId}/analytics`)
  },

  // Judge (voter)
  listJudgeEvents() {
    return api.get(`${judge}/events`)
  },

  getScoringSheet(eventId) {
    return api.get(`${judge}/events/${eventId}/score`)
  },

  submitScores(eventId, scores) {
    return api.post(`${judge}/events/${eventId}/score`, { scores })
  },
}

// Legacy alias — `/pageant` paths still resolve on the server, so older
// imports keep working without a code change.
export const legacyPageantService = {
  ...pageantService,
  getDashboard: () => api.get(`${orgLegacy}/dashboard`),
  listEvents: () => api.get(`${orgLegacy}/events`),
  listJudgeEvents: () => api.get(`${judgeLegacy}/events`),
}

// New canonical name.
export const competitionService = pageantService
