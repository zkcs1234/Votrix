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

  // There is no update call on purpose: an organizer's profile is edited only by an
  // administrator (PUT /admin/organizers/:id). The organization logo is separate.
}

