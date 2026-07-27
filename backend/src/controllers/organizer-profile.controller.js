/**
 * Organizer Profile Controller
 *
 * Handles the organizer onboarding profile endpoints.
 * Organizers must complete their profile before accessing the dashboard.
 */

import { asyncHandler } from '../utils/asyncHandler.js'
import * as organizerProfileService from '../services/organizer-profile.service.js'
import { ApiError } from '../utils/ApiError.js'

/**
 * Validate the profile update payload.
 * All 4 fields are required and must be non-empty strings.
 */
function validateProfilePayload(body) {
  const { organizationName, organizationType, organizerName, position } = body ?? {}
  const errors = []

  if (!organizationName?.trim()) errors.push('Organization name is required')
  if (!organizationType?.trim()) errors.push('Organization type is required')
  if (!organizerName?.trim()) errors.push('Organizer name is required')
  if (!position?.trim()) errors.push('Position is required')

  if (errors.length > 0) {
    throw new ApiError(400, errors.join('; '))
  }

  return {
    organizationName: organizationName.trim(),
    organizationType: organizationType.trim(),
    organizerName: organizerName.trim(),
    position: position.trim(),
  }
}

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
 * Creates or updates the organizer's profile.
 * All 4 fields are required.
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const payload = validateProfilePayload(req.body)
  const profile = await organizerProfileService.updateOrganizerProfile(req.user.id, payload)

  res.json({
    success: true,
    message: 'Organization profile saved successfully',
    profile,
  })
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

