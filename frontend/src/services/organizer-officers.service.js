import api from '@/services/api'

// Owner-organizer endpoints for managing student officers. The backend rejects
// these for an officer acting as the organizer.
const base = '/organizer/officers'

export const organizerOfficersService = {
  list(params = {}) {
    return api.get(base, { params })
  },
  candidates(params = {}) {
    return api.get(`${base}/candidates`, { params })
  },
  assign({ studentId, position }) {
    return api.post(base, { studentId, position })
  },
  updatePosition(officerId, position) {
    return api.patch(`${base}/${officerId}`, { position })
  },
  deactivate(officerId) {
    return api.post(`${base}/${officerId}/deactivate`)
  },
  activate(officerId) {
    return api.post(`${base}/${officerId}/activate`)
  },
}
