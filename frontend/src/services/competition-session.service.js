import api from '@/services/api'

const BASE = '/organizer/competition'
const JUDGE_BASE = '/voter/competition'

export const competitionSessionService = {
  // --- Organizer session management ---

  /** GET /api/organizer/competition/events/:eventId/session/active */
  getActiveSession(eventId) {
    return api.get(`${BASE}/events/${eventId}/session/active`)
  },

  /** GET /api/organizer/competition/events/:eventId/sessions */
  listSessions(eventId) {
    return api.get(`${BASE}/events/${eventId}/sessions`)
  },

  /** GET /api/organizer/competition/events/:eventId/sessions/:sessionId */
  getSession(eventId, sessionId) {
    return api.get(`${BASE}/events/${eventId}/sessions/${sessionId}`)
  },

  /** POST /api/organizer/competition/events/:eventId/session/start */
  startSession(eventId) {
    return api.post(`${BASE}/events/${eventId}/session/start`)
  },

  /** POST /api/organizer/competition/events/:eventId/session/pause */
  pauseSession(eventId) {
    return api.post(`${BASE}/events/${eventId}/session/pause`)
  },

  /** POST /api/organizer/competition/events/:eventId/session/resume */
  resumeSession(eventId) {
    return api.post(`${BASE}/events/${eventId}/session/resume`)
  },

  /** POST /api/organizer/competition/events/:eventId/session/complete */
  completeSession(eventId) {
    return api.post(`${BASE}/events/${eventId}/session/complete`)
  },

  /** POST /api/organizer/competition/events/:eventId/session/next-contestant */
  nextContestant(eventId) {
    return api.post(`${BASE}/events/${eventId}/session/next-contestant`)
  },

  /** POST /api/organizer/competition/events/:eventId/session/prev-contestant */
  previousContestant(eventId) {
    return api.post(`${BASE}/events/${eventId}/session/prev-contestant`)
  },

  /** POST /api/organizer/competition/events/:eventId/session/set-contestant */
  setActiveContestant(eventId, contestantId) {
    return api.post(`${BASE}/events/${eventId}/session/set-contestant`, { contestantId })
  },

  /** POST /api/organizer/competition/events/:eventId/session/set-round */
  setActiveRound(eventId, roundId) {
    return api.post(`${BASE}/events/${eventId}/session/set-round`, { roundId })
  },

  /** POST /api/organizer/competition/events/:eventId/session/set-division */
  setActiveDivision(eventId, divisionId) {
    return api.post(`${BASE}/events/${eventId}/session/set-division`, { divisionId })
  },

  /** GET /api/organizer/competition/events/:eventId/session/judge-progress */
  getJudgeProgress(eventId) {
    return api.get(`${BASE}/events/${eventId}/session/judge-progress`)
  },

  // --- Round finalize & advancement (Phase 6) ---

  /** GET /api/organizer/competition/events/:eventId/rounds/:roundId/advancement-preview */
  previewRoundAdvancement(eventId, roundId) {
    return api.get(`${BASE}/events/${eventId}/rounds/${roundId}/advancement-preview`)
  },

  /** POST /api/organizer/competition/events/:eventId/session/finalize-round */
  finalizeRound(eventId, roundId, overrides = null) {
    return api.post(`${BASE}/events/${eventId}/session/finalize-round`, { roundId, overrides })
  },

  /** GET /api/organizer/competition/events/:eventId/rounds/:roundId/results */
  getRoundResults(eventId, roundId) {
    return api.get(`${BASE}/events/${eventId}/rounds/${roundId}/results`)
  },

  // --- Judge/voter session scoring ---

  /** GET /api/voter/competition/events/:eventId/session-view */
  getJudgeSessionView(eventId) {
    return api.get(`${JUDGE_BASE}/events/${eventId}/session-view`)
  },

  /** POST /api/voter/competition/events/:eventId/session-score */
  submitJudgeSessionScore(eventId, scores) {
    return api.post(`${JUDGE_BASE}/events/${eventId}/session-score`, { scores })
  },
}

