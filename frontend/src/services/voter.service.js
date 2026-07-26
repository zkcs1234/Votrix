import api from '@/services/api'

export const voterService = {
  getOverview() {
    return api.get('/voter/overview')
  },
  getLoginRedirect() {
    return api.get('/voter/login-redirect')
  },
  /** Get all participant roles for the current user across all events */
  getMyParticipantTypes() {
    return api.get('/voter/participant-types')
  },
  /** Get participant type and status for a specific event */
  getMyEventRole(eventId) {
    return api.get(`/voter/events/${eventId}/my-role`)
  },
  /** Update participant information form data */
  updateParticipantInformation(eventId, metadata) {
    return api.patch(`/voter/events/${eventId}/participant-information`, { metadata })
  },
}

export const EVENT_TYPE_META = {
  election: { label: 'Election', color: 'indigo' },
  pageant: { label: 'Pageant', color: 'pink' },
  competition_scoring: { label: 'Competition', color: 'pink' },
  polling: { label: 'Poll', color: 'cyan' },
}

// Participant type metadata for display in UI
export const PARTICIPANT_TYPE_META = {
  ELECTION_VOTER: { label: 'Voter', color: 'indigo', icon: 'Vote' },
  COMPETITION_JUDGE: { label: 'Judge', color: 'pink', icon: 'Trophy' },
  POLLING_RESPONDENT: { label: 'Respondent', color: 'cyan', icon: 'BarChart2' },
}
