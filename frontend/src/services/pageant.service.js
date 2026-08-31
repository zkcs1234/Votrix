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

  listEvents() {
    return api.get(`${org}/events`)
  },

  getTemplates() {
    return api.get(`${org}/templates`)
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

  getNextContestantNumber(eventId, divisionId = null) {
    const qs = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : ''
    return api.get(`${org}/events/${eventId}/contestants/next-number${qs}`)
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

  // Canonical read path uses event_participants-backed judge enrollment.
  listJudges(eventId) {
    return api.get(`${org}/events/${eventId}/judges-v2`)
  },

  inviteJudge(eventId, payload) {
    return api.post(`${org}/events/${eventId}/judges/invite`, payload)
  },

  importJudgesCsv(eventId, file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${org}/events/${eventId}/judges/import`, form)
  },

  registerJudge(eventId, payload) {
    return api.post(`${org}/events/${eventId}/judges/register`, payload)
  },

  sendJudgeInvitation(eventId, userId) {
    return api.post(`${org}/events/${eventId}/judges/${userId}/send-invitation`)
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

  getRankings(eventId, params = {}) {
    return api.get(`${org}/events/${eventId}/rankings`, { params })
  },

  getResults(eventId) {
    return api.get(`${org}/events/${eventId}/results`)
  },

  getAnalytics(eventId, params = {}) {
    return api.get(`${org}/events/${eventId}/analytics`, { params })
  },

  // ——— Divisions ———
  listDivisions(eventId) {
    return api.get(`${org}/events/${eventId}/divisions`)
  },
  createDivision(eventId, payload) {
    return api.post(`${org}/events/${eventId}/divisions`, payload)
  },
  updateDivision(eventId, divisionId, payload) {
    return api.patch(`${org}/events/${eventId}/divisions/${divisionId}`, payload)
  },
  deleteDivision(eventId, divisionId) {
    return api.delete(`${org}/events/${eventId}/divisions/${divisionId}`)
  },
  setDivisionsEnabled(eventId, enabled) {
    return api.patch(`${org}/events/${eventId}/divisions-enabled`, { divisionsEnabled: enabled })
  },

  // Awards (optional feature)
  listAwards(eventId) {
    return api.get(`${org}/events/${eventId}/awards`)
  },
  getAwardWinners(eventId) {
    return api.get(`${org}/events/${eventId}/awards/winners`)
  },
  createAward(eventId, payload) {
    return api.post(`${org}/events/${eventId}/awards`, payload)
  },
  updateAward(eventId, awardId, payload) {
    return api.patch(`${org}/events/${eventId}/awards/${awardId}`, payload)
  },
  deleteAward(eventId, awardId) {
    return api.delete(`${org}/events/${eventId}/awards/${awardId}`)
  },
  setAwardsEnabled(eventId, enabled) {
    return api.patch(`${org}/events/${eventId}/awards-enabled`, { enabled })
  },
  setAwardStatus(eventId, awardId, status) {
    return api.patch(`${org}/events/${eventId}/awards/${awardId}/status`, { status })
  },
  // Judge-side interactive award endpoints (voter base)
  getAwardTasks(eventId) {
    return api.get(`${judge}/events/${eventId}/award-tasks`)
  },
  submitAwardSelection(eventId, awardId, contestantId) {
    return api.post(`${judge}/events/${eventId}/awards/${awardId}/select`, { contestantId })
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

  // Phase 6 — Judge participants.
  // Updates, deletes, and assignments use event_participants.id.
  listJudgesV2(eventId) {
    return api.get(`${org}/events/${eventId}/judges-v2`)
  },
  inviteJudgeV2(eventId, payload) {
    return api.post(`${org}/events/${eventId}/judges-v2/invite`, payload)
  },
  updateJudgeV2(eventId, participantId, payload) {
    return api.patch(`${org}/events/${eventId}/judges-v2/${participantId}`, payload)
  },
  deleteJudgeV2(eventId, participantId) {
    return api.delete(`${org}/events/${eventId}/judges-v2/${participantId}`)
  },
  listJudgeAssignments(eventId, participantId) {
    return api.get(`${org}/events/${eventId}/judges-v2/${participantId}/assignments`)
  },
  createJudgeAssignment(eventId, participantId, payload) {
    return api.post(`${org}/events/${eventId}/judges-v2/${participantId}/assignments`, payload)
  },
  deleteJudgeAssignment(eventId, participantId, assignmentId) {
    return api.delete(`${org}/events/${eventId}/judges-v2/${participantId}/assignments/${assignmentId}`)
  },

  // ——— Participant Information Form ———
  getInformationForm(eventId) {
    return api.get(`${org}/events/${eventId}/information-form`)
  },

  updateInformationForm(eventId, schema) {
    return api.patch(`${org}/events/${eventId}/information-form`, schema)
  },

  // Judge (voter)
  listJudgeEvents() {
    return api.get(`${judge}/events`)
  },

  getScoringSheet(eventId, params = {}) {
    return api.get(`${judge}/events/${eventId}/score`, { params })
  },

  getSessionView(eventId) {
    return api.get(`${judge}/events/${eventId}/session-view`)
  },

  getActiveSession(eventId) {
    return api.get(`${org}/events/${eventId}/session/active`)
  },

  submitScores(eventId, scores, sessionContext = {}) {
    return api.post(`${judge}/events/${eventId}/score`, {
      scores,
      sessionId: sessionContext.sessionId || null,
      roundId: sessionContext.roundId || null,
      contestantId: sessionContext.contestantId || null
    })
  },

  // Live session scoring - individual score submission during live sessions
  submitSessionScore(eventId, scores, contestantId) {
    return api.post(`${judge}/events/${eventId}/session-score`, { scores, contestantId })
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
