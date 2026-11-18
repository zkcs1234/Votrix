import api from '@/services/api'

const org = '/organizer/polling'
const voter = '/participant/polling'

export const pollingService = {
  getDashboard() {
    return api.get(`${org}/dashboard`)
  },

  uploadBanner(eventId, file) {
    const form = new FormData()
    form.append('banner', file)
    return api.post(`${org}/events/${eventId}/banner`, form)
  },

  uploadGenericImage(eventId, file) {
    const form = new FormData()
    form.append('image', file)
    return api.post(`${org}/events/${eventId}/image`, form)
  },

  listEvents() {
    return api.get(`${org}/events`)
  },

  createEvent(payload) {
    return api.post(`${org}/events`, payload)
  },

  updateEvent(eventId, payload) {
    return api.patch(`${org}/events/${eventId}`, payload)
  },

  getSettings(eventId) {
    return api.get(`${org}/events/${eventId}/settings`)
  },

  // Normalized event accessor so shared hooks (useEventStatus) can read the
  // poll's status via the same `{ data: { event } }` shape as other modules.
  getEvent(eventId) {
    return api
      .get(`${org}/events/${eventId}/settings`)
      .then((res) => ({ ...res, data: { ...res.data, event: res.data.settings } }))
  },

  // Publish a fully-built setup (draft) poll: releases it to the schedule.
  publishEvent(eventId) {
    return api.post(`${org}/events/${eventId}/publish`)
  },

  // Pull a published (scheduled) poll back to draft so setup can be corrected.
  // `reason` is required by the server when pausing a live poll.
  unpublishEvent(eventId, reason) {
    return api.post(`${org}/events/${eventId}/unpublish`, reason ? { reason } : undefined)
  },

  getEditPolicy(eventId) {
    return api.get(`${org}/events/${eventId}/edit-policy`)
  },

  listQuestions(eventId) {
    return api.get(`${org}/events/${eventId}/questions`)
  },

  createQuestion(eventId, payload) {
    return api.post(`${org}/events/${eventId}/questions`, payload)
  },

  updateQuestion(eventId, questionId, payload) {
    return api.patch(`${org}/events/${eventId}/questions/${questionId}`, payload)
  },

  deleteQuestion(eventId, questionId) {
    return api.delete(`${org}/events/${eventId}/questions/${questionId}`)
  },

  duplicateQuestion(eventId, questionId) {
    return api.post(`${org}/events/${eventId}/questions/${questionId}/duplicate`)
  },

  reorderQuestions(eventId, orders) {
    return api.patch(`${org}/events/${eventId}/questions/reorder`, { orders })
  },

  getAnalytics(eventId) {
    return api.get(`${org}/events/${eventId}/analytics`)
  },

  // List voters/respondents for an event
  listVoters(eventId, { page = 1, limit = 500 } = {}) {
    // The backend paginates (default 50); ask for a full page so a large roster
    // is not silently cut off in the enrolled list.
    return api.get(`${org}/events/${eventId}/voters`, { params: { page, limit } })
  },

  // Cohort invite (plan Phase 5).
  getCohorts(eventId) {
    return api.get(`${org}/events/${eventId}/cohorts`)
  },
  inviteCohort(eventId, payload) {
    return api.post(`${org}/events/${eventId}/invite-cohort`, payload)
  },
  removeParticipant(eventId, userId) {
    return api.delete(`${org}/events/${eventId}/participants/${userId}`)
  },

  // Phase 7 — Question type registry - force HMR reload
  listQuestionTypes() {
    return api.get(`${org}/question-types`)
  },
  listCustomQuestionTypes() {
    return api.get(`${org}/question-types/custom`)
  },
  createCustomQuestionType(payload) {
    return api.post(`${org}/question-types/custom`, payload)
  },
  updateCustomQuestionType(typeId, payload) {
    return api.patch(`${org}/question-types/custom/${typeId}`, payload)
  },
  deleteCustomQuestionType(typeId) {
    return api.delete(`${org}/question-types/custom/${typeId}`)
  },

  listMyPolls() {
    return api.get(`${voter}/events`)
  },

  getPoll(eventId) {
    return api.get(`${voter}/events/${eventId}`)
  },

  /** Aggregate results for one poll (only when its results visibility allows). */
  getPollResults(eventId) {
    return api.get(`${voter}/events/${eventId}/results`)
  },

  submitPoll(eventId, answers, options = {}) {
    const payload = { answers }
    if (options.startedAt) {
      payload.startedAt = options.startedAt
    }
    return api.post(`${voter}/events/${eventId}/submit`, payload)
  },
}

export const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'text', label: 'Text' },
  { value: 'rating', label: 'Rating (1–5)' },
]
