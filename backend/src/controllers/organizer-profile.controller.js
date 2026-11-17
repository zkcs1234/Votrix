/**
 * Organizer Profile Controller
 *
 * Read-only organizer profile endpoints. The organization name, type, organizer name
 * and position come from the application (or from the admin who created the account),
 * and only an administrator changes them (PUT /api/admin/organizers/:id).
 */

import { asyncHandler } from '../utils/asyncHandler.js'
import * as organizerProfileService from '../services/organizer-profile.service.js'
import { ApiError } from '../utils/ApiError.js'

/**
 * GET /api/organizer/profile
 * Returns the organizer's current profile.
 */
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await organizerProfileService.getOrganizerProfile(req.user.id)
  res.json({ success: true, profile })
})

/**
 * PUT /api/organizer/profile
 *
 * Organizers cannot edit their own profile. The route stays so a stale client gets a
 * clear answer instead of a 404. The organization logo is separate and the organizer
 * can still upload it (POST /api/organizer/organization/logo).
 */
export const updateProfile = asyncHandler(async () => {
  throw new ApiError(403, 'Your profile is managed by an administrator. Contact an administrator to change it.')
})

/**
 * GET /api/organizer/profile/status
 * Checks whether the organizer's profile is complete.
 * Returns { complete: boolean }.
 */
export const getProfileStatus = asyncHandler(async (req, res) => {
  const { complete, profile } = await organizerProfileService.isOrganizerProfileComplete(req.user.id)
  res.json({ success: true, complete, profile })
})
