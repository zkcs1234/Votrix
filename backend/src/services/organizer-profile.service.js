/**
 * Organizer Profile Service
 *
 * Manages the organizer's organization profile stored on the users table.
 * Fields: organization_name, organization_type_display, organizer_name, position
 *
 * This service supports the onboarding flow:
 *   1. Organizer signs in → profile check → if incomplete → onboarding form
 *   2. Organizer fills 4 fields → profile saved → access to dashboard
 *   3. Admin can view profile status and trigger onboarding reminders
 */

import { db, wrap } from '../foundation/db.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'
import { badRequest, notFound } from '../foundation/errors.js'
import { recordAudit } from '../foundation/audit.js'

/**
 * Get the organizer's profile from the users table.
 *
 * @param {string} organizerId - The organizer's user ID
 * @returns {Promise<object>} Profile object with camelCase keys
 */
export async function getOrganizerProfile(organizerId) {
  const result = await db()
    .from(DB_TABLES.USERS)
    .select('id, email, organization_name, organization_type_display, organizer_name, position, organization_logo')
    .eq('id', organizerId)
    .eq('role', USER_ROLES.ORGANIZER)
    .single()

  const user = await wrap(result, { context: 'organizerProfile.getProfile' })
  if (!user) throw notFound('Organizer not found')

  return {
    id: user.id,
    email: user.email,
    organizationName: user.organization_name || '',
    organizationType: user.organization_type_display || '',
    organizerName: user.organizer_name || '',
    position: user.position || '',
    logo: user.organization_logo || null,
  }
}

/**
 * Update the organizer's profile fields on the users table.
 * Only updates fields that are provided (partial update).
 *
 * @param {string} organizerId - The organizer's user ID
 * @param {object} fields - Profile fields to update
 * @param {string} [fields.organizationName] - Organization name
 * @param {string} [fields.organizationType] - Organization type (free text)
 * @param {string} [fields.organizerName] - Organizer's name
 * @param {string} [fields.position] - Organizer's position/role
 * @returns {Promise<object>} Updated profile object
 */
export async function updateOrganizerProfile(organizerId, { organizationName, organizationType, organizerName, position }) {
  const updates = {}

  if (organizationName !== undefined) updates.organization_name = organizationName.trim()
  if (organizationType !== undefined) updates.organization_type_display = organizationType.trim()
  if (organizerName !== undefined) updates.organizer_name = organizerName.trim()
  if (position !== undefined) updates.position = position.trim()

  if (Object.keys(updates).length === 0) {
    throw badRequest('No fields to update')
  }

  const result = await db()
    .from(DB_TABLES.USERS)
    .update(updates)
    .eq('id', organizerId)
    .eq('role', USER_ROLES.ORGANIZER)
    .select('id, email, organization_name, organization_type_display, organizer_name, position, organization_logo')
    .single()

  const user = await wrap(result, { context: 'organizerProfile.updateProfile' })
  if (!user) throw notFound('Organizer not found')

  recordAudit({
    userId: organizerId,
    action: 'organizer.profile.update',
    entity: 'users',
    entityId: organizerId,
    details: { changedKeys: Object.keys(updates) },
  })

  return {
    id: user.id,
    email: user.email,
    organizationName: user.organization_name || '',
    organizationType: user.organization_type_display || '',
    organizerName: user.organizer_name || '',
    position: user.position || '',
    logo: user.organization_logo || null,
  }
}

/**
 * Check if the organizer's profile is complete.
 * A profile is complete when all 4 required fields are non-empty strings.
 *
 * Required fields:
 *   - organization_name
 *   - organization_type_display
 *   - organizer_name
 *   - position
 *
 * @param {string} organizerId - The organizer's user ID
 * @returns {Promise<{complete: boolean, profile: object}>}
 */
export async function isOrganizerProfileComplete(organizerId) {
  const result = await db()
    .from(DB_TABLES.USERS)
    .select('organization_name, organization_type_display, organizer_name, position')
    .eq('id', organizerId)
    .eq('role', USER_ROLES.ORGANIZER)
    .single()

  const user = await wrap(result, { context: 'organizerProfile.isComplete' })
  if (!user) throw notFound('Organizer not found')

  const complete = Boolean(
    user.organization_name?.trim() &&
    user.organization_type_display?.trim() &&
    user.organizer_name?.trim() &&
    user.position?.trim(),
  )

  return {
    complete,
    profile: {
      organizationName: user.organization_name || '',
      organizationType: user.organization_type_display || '',
      organizerName: user.organizer_name || '',
      position: user.position || '',
    },
  }
}

