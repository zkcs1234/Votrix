/**
 * Organizer Profile API Service
 *
 * Manages the organizer's organization profile.
 * Used during onboarding to collect required profile information
 * before granting access to the organizer dashboard.
 */

import api from '@/services/api'

const base = '/organizer'

export const organizerProfileService = {
  /**
   * Get the organizer's current profile.
   * @returns {Promise<{data: {success: boolean, profile: object}}>}
   */
  getProfile() {
    return api.get(`${base}/profile`)
  },

  /**
   * Check whether the organizer's profile is complete.
   * @returns {Promise<{data: {success: boolean, complete: boolean}}>}
   */
  getProfileStatus() {
    return api.get(`${base}/profile/status`)
  },

  /**
   * Create or update the organizer's profile.
   * All 4 fields are required.
   *
   * @param {object} payload
   * @param {string} payload.organizationName - Organization name
   * @param {string} payload.organizationType - Organization type (free text)
   * @param {string} payload.organizerName - Organizer's full name
   * @param {string} payload.position - Organizer's position/role
   * @returns {Promise<{data: {success: boolean, profile: object}}>}
   */
  updateProfile(payload) {
    return api.put(`${base}/profile`, payload)
  },
}

