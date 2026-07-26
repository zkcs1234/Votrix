// Phase 10 — Consolidated to single organization per organizer.
// Organization_type is removed from the organization model; each organizer
// has exactly one organization. Organization name and logo are stored on
// the users table.

import { db, wrap } from '../foundation/db.js'
import { mapOrganization as mapOrganizationShared } from '../foundation/mapper.js'
import { forbidden, badRequest } from '../foundation/errors.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, ORG_TYPES } from '../utils/constants.js'

// Re-export the shared mapper so existing imports
// `import { mapOrganization } from './organization.service.js'`
// keep working.
export function mapOrganization(row) {
  return mapOrganizationShared(row)
}

/**
 * Get the single organization for an organizer.
 * If none exists, creates one (1:1 relationship).
 */
export async function getOrCreateOrganization(organizerId) {
  if (!organizerId) {
    throw new ApiError(400, 'organizerId is required')
  }

  const orgs = await listOrganizations(organizerId)
  if (orgs.length > 0) return orgs[0]

  // Create the single organization — organization_type is deprecated but
  // kept for backward compatibility during the transition.
  return createOrganization(organizerId, {
    organizationName: 'My Organization',
    organizationType: ORG_TYPES.ELECTION,
  })
}

/**
 * Legacy alias — no longer type-specific. Kept for backward compatibility
 * so existing callers (election.service.js, pageant.service.js, etc.)
 * continue to work without changes.
 *
 * @deprecated Use getOrCreateOrganization() instead.
 */
export const getOrCreateElectionOrganization = getOrCreateOrganization

/**
 * Legacy alias — kept for backward compatibility.
 * @deprecated Use getOrCreateOrganization() instead.
 */
export const getOrCreatePollingOrganization = getOrCreateOrganization

/**
 * Legacy alias — kept for backward compatibility.
 * @deprecated Use getOrCreateOrganization() instead.
 */
export const getOrCreateCompetitionScoringOrganization = getOrCreateOrganization

/**
 * Legacy alias — kept for backward compatibility.
 * @deprecated Use getOrCreateOrganization() instead.
 */
export const getOrCreatePageantOrganization = getOrCreateOrganization

export async function listOrganizations(organizerId) {
  try {
    const result = wrap(
      await db()
        .from(DB_TABLES.ORGANIZATIONS)
        .select('*')
        .eq('organizer_id', organizerId)
        .order('created_at', { ascending: false })
        .limit(1),
      { context: 'organization.listOrganizations' },
    )
    return result ?? []
  } catch (error) {
    // Return empty array on error to allow fallback behavior
    console.error('[listOrganizations] Error:', error.message)
    return []
  }
}

export async function createOrganization(organizerId, { organizationName, organizationType }) {
  return wrap(
    await db()
      .from(DB_TABLES.ORGANIZATIONS)
      .insert({
        organization_name: organizationName,
        organization_type: organizationType || ORG_TYPES.ELECTION,
        organizer_id: organizerId,
        status: 'active',
      })
      .select('*')
      .single(),
    { context: 'organization.createOrganization' },
  )
}

/**
 * Update the organization logo.
 * Logo is now stored on the users table (not organizations.logo).
 */
export async function updateOrganizationLogo(organizerId, logoUrl) {
  const org = await getOrCreateOrganization(organizerId)
  if (org.organizer_id !== organizerId) {
    throw forbidden('Not allowed to update this organization')
  }

  // Update logo on the users table (organization_logo column)
  const { data: userData, error } = await db()
    .from(DB_TABLES.USERS)
    .update({ organization_logo: logoUrl })
    .eq('id', organizerId)
    .select('organization_logo')
    .single()

  if (error) throw new ApiError(500, error.message)

  return {
    ...mapOrganization(org),
    logo: userData?.organization_logo ?? null,
  }
}
