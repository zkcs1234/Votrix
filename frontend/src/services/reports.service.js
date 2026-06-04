import api from '@/services/api'

const base = '/organizer/reports'

export const reportsService = {
  getOverview() {
    return api.get(`${base}/overview`)
  },

  getElectionReport(eventId) {
    return api.get(`${base}/election/${eventId}`)
  },

  getPageantReport(eventId) {
    return api.get(`${base}/competition/${eventId}`)
  },

  getCompetitionReport(eventId) {
    return api.get(`${base}/competition/${eventId}`)
  },

  getPollingReport(eventId) {
    return api.get(`${base}/polling/${eventId}`)
  },
}
