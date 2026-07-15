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
    return api.post(`${org}/organization/logo`, form)
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
    return api.post(`${org}/events/${eventId}/banner`, form)
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
    return api.post(`${org}/events/${eventId}/contestants/${contestantId}/photo`, form)
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
    return api.post(`${org}/events/${eventId}/judges/import`, form)
  },

  // New workflow: register without email, send later
  registerJudge(eventId, payload) {
    return api.post(`${org}/events/${eventId}/judges/register`, payload)
  },

  sendJudgeInvitation(eventId, judgeId) {
    return api.post(`${org}/events/${eventId}/judges/${judgeId}/send-invitation`)
  },

  sendAllJudgeInvitations(eventId) {
    return api.post(`${org}/events/${eventId}/judges/send-all`)
  },

  previewJudgesCsv(eventId, file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${org}/events/${eventId}/judges/import-preview`, form)
  },

  registerJudgesCsv(eventId, data) {
    return api.post(`${org}/events/${eventId}/judges/import-register`, { data })
  },

  getRankings(eventId) {
    return api.get(`${org}/events/${eventId}/rankings`)
  },

  getAnalytics(eventId) {
    return api.get(`${org}/events/${eventId}/analytics`)
  },

  // Phase 4 — Foundation (single round-trip for the workspace UI)
  getFoundation(eventId) {
    return api.get(`${org}/events/${eventId}/foundation`)
  },

  // Phase 4 — Categories
  listCategories(eventId) {
    return api.get(`${org}/events/${eventId}/categories`)
  },
  createCategory(eventId, payload) {
    return api.post(`${org}/events/${eventId}/categories`, payload)
  },
  updateCategory(eventId, categoryId, payload) {
    return api.patch(`${org}/events/${eventId}/categories/${categoryId}`, payload)
  },
  deleteCategory(eventId, categoryId) {
    return api.delete(`${org}/events/${eventId}/categories/${categoryId}`)
  },

  // Phase 4 — Rounds
  listRounds(eventId) {
    return api.get(`${org}/events/${eventId}/rounds`)
  },
  createRound(eventId, payload) {
    return api.post(`${org}/events/${eventId}/rounds`, payload)
  },
  updateRound(eventId, roundId, payload) {
    return api.patch(`${org}/events/${eventId}/rounds/${roundId}`, payload)
  },
  deleteRound(eventId, roundId) {
    return api.delete(`${org}/events/${eventId}/rounds/${roundId}`)
  },
  addRoundContestant(eventId, roundId, contestantId) {
    return api.post(`${org}/events/${eventId}/rounds/${roundId}/contestants/${contestantId}`)
  },
  removeRoundContestant(eventId, roundId, contestantId) {
    return api.delete(`${org}/events/${eventId}/rounds/${roundId}/contestants/${contestantId}`)
  },
  addRoundCriteria(eventId, roundId, criteriaId) {
    return api.post(`${org}/events/${eventId}/rounds/${roundId}/criteria/${criteriaId}`)
  },
  removeRoundCriteria(eventId, roundId, criteriaId) {
    return api.delete(`${org}/events/${eventId}/rounds/${roundId}/criteria/${criteriaId}`)
  },

  // Phase 5 — Scoring config
  getScoringConfig(eventId) {
    return api.get(`${org}/events/${eventId}/scoring-config`)
  },
  setScoringConfig(eventId, payload) {
    return api.patch(`${org}/events/${eventId}/scoring-config`, payload)
  },

  // Phase 6 — First-class judges
  listJudgesV2(eventId) {
    return api.get(`${org}/events/${eventId}/judges-v2`)
  },
  inviteJudgeV2(eventId, payload) {
    return api.post(`${org}/events/${eventId}/judges-v2/invite`, payload)
  },
  updateJudgeV2(eventId, judgeId, payload) {
    return api.patch(`${org}/events/${eventId}/judges-v2/${judgeId}`, payload)
  },
  deleteJudgeV2(eventId, judgeId) {
    return api.delete(`${org}/events/${eventId}/judges-v2/${judgeId}`)
  },
  listJudgeAssignments(eventId, judgeId) {
    return api.get(`${org}/events/${eventId}/judges-v2/${judgeId}/assignments`)
  },
  createJudgeAssignment(eventId, judgeId, payload) {
    return api.post(`${org}/events/${eventId}/judges-v2/${judgeId}/assignments`, payload)
  },
  deleteJudgeAssignment(eventId, judgeId, assignmentId) {
    return api.delete(`${org}/events/${eventId}/judges-v2/${judgeId}/assignments/${assignmentId}`)
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
