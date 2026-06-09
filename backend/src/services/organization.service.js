// Phase 9 — refactored to use the shared `foundation/` helpers.
// The exported surface is unchanged; behaviour is identical.

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

export async function listOrganizations(organizerId) {
  try {
    const result = wrap(
      db()
        .from(DB_TABLES.ORGANIZATIONS)
        .select('*')
        .eq('organizer_id', organizerId)
        .order('created_at', { ascending: false }),
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
    db()
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

export async function getOrCreateElectionOrganization(organizerId) {
  if (!organizerId) {
    throw new ApiError(400, 'organizerId is required')
  }

  const orgs = (await listOrganizations(organizerId)) ?? []
  const existing = orgs.find((o) => o.organization_type === ORG_TYPES.ELECTION)
  if (existing) return existing

  return createOrganization(organizerId, {
    organizationName: 'My Elections',
    organizationType: ORG_TYPES.ELECTION,
  })
}

export async function getOrCreatePollingOrganization(organizerId) {
  const orgs = await listOrganizations(organizerId)
  const existing = orgs.find((o) => o.organization_type === ORG_TYPES.POLLING)
  if (existing) return existing

  return createOrganization(organizerId, {
    organizationName: 'My Polls',
    organizationType: ORG_TYPES.POLLING,
  })
}

export async function getOrCreatePageantOrganization(organizerId) {
  return getOrCreateCompetitionScoringOrganization(organizerId)
}

export async function getOrCreateCompetitionScoringOrganization(organizerId) {
  const orgs = await listOrganizations(organizerId)
  // Prefer the new enum value but fall back to legacy 'pageant' rows so
  // existing organizers keep a single shared organization.
  const existing =
    orgs.find((o) => o.organization_type === ORG_TYPES.COMPETITION_SCORING) ||
    orgs.find((o) => o.organization_type === ORG_TYPES.PAGEANT)
  if (existing) return existing

  return createOrganization(organizerId, {
    organizationName: 'My Competitions',
    organizationType: ORG_TYPES.COMPETITION_SCORING,
  })
}

async function getOrganizationForType(organizerId, organizationType) {
  if (organizationType === ORG_TYPES.ELECTION) {
    return getOrCreateElectionOrganization(organizerId)
  }
  if (organizationType === ORG_TYPES.PAGEANT || organizationType === ORG_TYPES.COMPETITION_SCORING) {
    return getOrCreateCompetitionScoringOrganization(organizerId)
  }
  if (organizationType === ORG_TYPES.POLLING) {
    return getOrCreatePollingOrganization(organizerId)
  }
  throw badRequest('Invalid organization type')
}

export async function updateOrganizationLogo(organizerId, organizationType, logoUrl) {
  const org = await getOrganizationForType(organizerId, organizationType)
  if (org.organizer_id !== organizerId) {
    throw forbidden('Not allowed to update this organization')
  }

  const data = await wrap(
    db()
      .from(DB_TABLES.ORGANIZATIONS)
      .update({ logo: logoUrl })
      .eq('id', org.id)
      .select('*')
      .single(),
    { context: 'organization.updateOrganizationLogo' },
  )
  return mapOrganization(data)
}
