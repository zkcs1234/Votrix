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
    return api.post(`${base}/organization/logo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
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
    return api.post(`${base}/events/${eventId}/banner`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
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
    return api.post(`${base}/events/${eventId}/candidates/${candidateId}/photo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  listVoters(eventId) {
    return api.get(`${base}/events/${eventId}/voters`)
  },

  inviteVoter(eventId, payload) {
    return api.post(`${base}/events/${eventId}/voters/invite`, payload)
  },

  importCsv(eventId, file) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${base}/events/${eventId}/voters/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /**
   * Import CSV with progress tracking
   * Uses XMLHttpRequest to track upload progress
   * @param {string} eventId - Event ID
   * @param {File} file - CSV file
   * @param {Function} onProgress - Progress callback
   * @returns {Promise} - Import result
   */
  importCsvWithProgress(eventId, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const form = new FormData()
      form.append('file', file)

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          // Estimate total based on file size (rough estimate)
          const estimatedTotal = Math.max(event.total, file.size * 2)
          onProgress({
            processed: event.loaded,
            total: estimatedTotal,
            succeeded: Math.floor(event.loaded / 3),
            failed: 0,
          })
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ data: JSON.parse(xhr.responseText) })
        } else {
          reject({
            response: {
              data: JSON.parse(xhr.responseText),
              status: xhr.status,
            },
          })
        }
      }

      xhr.onerror = () => {
        reject({
          response: { data: { message: 'Network error during import' }, status: xhr.status },
        })
      }

      xhr.open('POST', `${api.defaults.baseURL}${base}/events/${eventId}/voters/import`)
      xhr.setRequestHeader('Authorization', `Bearer ${api.defaults.headers.Authorization?.replace('Bearer ', '')}`)
      xhr.withCredentials = true
      xhr.send(form)
    })
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
}
