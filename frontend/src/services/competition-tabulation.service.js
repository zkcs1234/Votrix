import api from '@/services/api'

const BASE = '/organizer/competition'

export const competitionTabulationService = {
  listDeductions(eventId, includeVoided = false) {
    return api.get(`${BASE}/events/${eventId}/deductions`, {
      params: includeVoided ? { includeVoided: true } : undefined,
    })
  },

  createDeduction(eventId, payload) {
    return api.post(`${BASE}/events/${eventId}/deductions`, payload)
  },

  voidDeduction(eventId, deductionId) {
    return api.post(`${BASE}/events/${eventId}/deductions/${deductionId}/void`)
  },

  calculate(eventId, payload) {
    return api.post(`${BASE}/events/${eventId}/tabulation/calculate`, payload)
  },

  getCalculation(eventId, calculationId) {
    return api.get(`${BASE}/events/${eventId}/tabulation/${calculationId}`)
  },

  getLatestCalculation(eventId, roundId=null) {
    return api.get(`${BASE}/events/${eventId}/tabulation/latest`,{params:roundId?{roundId}:undefined})
  },

  finalize(eventId, calculationId) {
    return api.post(`${BASE}/events/${eventId}/tabulation/${calculationId}/finalize`)
  },

  publish(eventId, calculationId) {
    return api.post(`${BASE}/events/${eventId}/tabulation/${calculationId}/publish`)
  },
}
