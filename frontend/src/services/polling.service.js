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
    return api.post(`${org}/organization/logo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  uploadBanner(eventId, file) {
    const form = new FormData()
    form.append('banner', file)
    return api.post(`${org}/events/${eventId}/banner`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
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

  importCsv(eventId, file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${org}/events/${eventId}/respondents/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
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

export const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'text', label: 'Text' },
  { value: 'rating', label: 'Rating (1–5)' },
]
