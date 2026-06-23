import api from '@/services/api'

const org = '/organizer/polling'
const voter = '/voter/polling'

export const pollingService = {
  getDashboard() {
    return api.get(`${org}/dashboard`)
  },

  uploadOrganizationLogo(file) {
    const form = new FormData()
    form.append('logo', file)
    return api.post(`${org}/organization/logo`, form)
  },

  uploadBanner(eventId, file) {
    const form = new FormData()
    form.append('banner', file)
    return api.post(`${org}/events/${eventId}/banner`, form)
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

  setPollOpen(eventId, pollingEnabled) {
    return api.patch(`${org}/events/${eventId}/open`, { pollingEnabled })
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

  getAnalytics(eventId) {
    return api.get(`${org}/events/${eventId}/analytics`)
  },

  inviteRespondent(eventId, payload) {
    return api.post(`${org}/events/${eventId}/respondents/invite`, payload)
  },

  inviteExistingRespondent(eventId, email) {
    return api.post(`${org}/events/${eventId}/respondents/invite-existing`, { email })
  },

  importCsv(eventId, file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${org}/events/${eventId}/respondents/import`, form)
  },

  // Phase 7 — Question type registry (database-driven)
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

  submitPoll(eventId, answers) {
    return api.post(`${voter}/events/${eventId}/submit`, { answers })
  },
}

// Backward-compat export. The UI no longer relies on this list; it loads
// types from the registry. Keep it for any existing imports.
export const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'text', label: 'Text' },
  { value: 'rating', label: 'Rating (1–5)' },
]
