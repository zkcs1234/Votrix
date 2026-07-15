import api from '@/services/api'

const base = '/organizer/election'
const voterBase = '/voter/election'

export const electionService = {
  getDashboard() {
    return api.get(`${base}/dashboard`)
  },

  uploadOrganizationLogo(file) {
    const form = new FormData()
    form.append('logo', file)
    return api.post(`${base}/organization/logo`, form)
  },

  listEvents() {
    return api.get(`${base}/events`)
  },

  createEvent(payload) {
    return api.post(`${base}/events`, payload)
  },

  getEvent(eventId) {
    return api.get(`${base}/events/${eventId}`)
  },

  updateEvent(eventId, payload) {
    return api.patch(`${base}/events/${eventId}`, payload)
  },

  setVoting(eventId, votingEnabled) {
    return api.patch(`${base}/events/${eventId}/voting`, { votingEnabled })
  },

  uploadBanner(eventId, file) {
    const form = new FormData()
    form.append('banner', file)
    return api.post(`${base}/events/${eventId}/banner`, form)
  },

  listPositions(eventId) {
    return api.get(`${base}/events/${eventId}/positions`)
  },

  createPosition(eventId, payload) {
    return api.post(`${base}/events/${eventId}/positions`, payload)
  },

  updatePosition(eventId, positionId, payload) {
    return api.patch(`${base}/events/${eventId}/positions/${positionId}`, payload)
  },

  deletePosition(eventId, positionId) {
    return api.delete(`${base}/events/${eventId}/positions/${positionId}`)
  },

  listCandidates(eventId, positionId) {
    return api.get(`${base}/events/${eventId}/candidates`, {
      params: positionId ? { positionId } : {},
    })
  },

  createCandidate(eventId, positionId, payload) {
    return api.post(`${base}/events/${eventId}/positions/${positionId}/candidates`, payload)
  },

  updateCandidate(eventId, candidateId, payload) {
    return api.patch(`${base}/events/${eventId}/candidates/${candidateId}`, payload)
  },

  deleteCandidate(eventId, candidateId) {
    return api.delete(`${base}/events/${eventId}/candidates/${candidateId}`)
  },

  uploadCandidatePhoto(eventId, candidateId, file) {
    const form = new FormData()
    form.append('photo', file)
    return api.post(`${base}/events/${eventId}/candidates/${candidateId}/photo`, form)
  },

  listVoters(eventId) {
    return api.get(`${base}/events/${eventId}/voters`)
  },

  // Register voter (no email sent)
  registerVoter(eventId, payload) {
    return api.post(`${base}/events/${eventId}/voters/register`, payload)
  },

  // Register existing voter (no email sent)
  registerExistingVoter(eventId, email) {
    return api.post(`${base}/events/${eventId}/voters/register-existing`, { email })
  },

  // Send invitation for specific voter
  sendInvitation(eventId, voterId) {
    return api.post(`${base}/events/${eventId}/voters/${voterId}/send-invitation`)
  },

  // Send all pending invitations
  sendAllInvitations(eventId) {
    return api.post(`${base}/events/${eventId}/voters/send-all`)
  },

  // Preview CSV without registering
  previewCsv(eventId, file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${base}/events/${eventId}/voters/import-preview`, form)
  },

  // Register voters from previewed CSV data
  registerCsv(eventId, data) {
    return api.post(`${base}/events/${eventId}/voters/import-register`, { data })
  },

  getAnalytics(eventId) {
    return api.get(`${base}/events/${eventId}/analytics`)
  },

  // Voter
  listMyEvents() {
    return api.get(`${voterBase}/events`)
  },

  getBallot(eventId) {
    return api.get(`${voterBase}/events/${eventId}/ballot`)
  },

  submitVote(eventId, selections) {
    return api.post(`${voterBase}/events/${eventId}/vote`, { selections })
  },

  getResults(eventId) {
    return api.get(`${voterBase}/events/${eventId}/results`)
  },
}
