import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, ORG_TYPES } from '../utils/constants.js'

export function mapOrganization(row) {
  if (!row) return null
  return {
    id: row.id,
    organizationName: row.organization_name,
    organizationType: row.organization_type,
    logo: row.logo ?? null,
    status: row.status,
    organizerId: row.organizer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

export async function listOrganizations(organizerId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZATIONS)
    .select('*')
    .eq('organizer_id', organizerId)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)
  return data ?? []
}

export async function createOrganization(organizerId, { organizationName, organizationType }) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZATIONS)
    .insert({
      organization_name: organizationName,
      organization_type: organizationType || ORG_TYPES.ELECTION,
      organizer_id: organizerId,
      status: 'active',
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function getOrCreateElectionOrganization(organizerId) {
  const orgs = await listOrganizations(organizerId)
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
  const orgs = await listOrganizations(organizerId)
  const existing = orgs.find((o) => o.organization_type === ORG_TYPES.PAGEANT)
  if (existing) return existing

  return createOrganization(organizerId, {
    organizationName: 'My Pageants',
    organizationType: ORG_TYPES.PAGEANT,
  })
}

async function getOrganizationForType(organizerId, organizationType) {
  if (organizationType === ORG_TYPES.ELECTION) {
    return getOrCreateElectionOrganization(organizerId)
  }
  if (organizationType === ORG_TYPES.PAGEANT) {
    return getOrCreatePageantOrganization(organizerId)
  }
  if (organizationType === ORG_TYPES.POLLING) {
    return getOrCreatePollingOrganization(organizerId)
  }
  throw new ApiError(400, 'Invalid organization type')
}

export async function updateOrganizationLogo(organizerId, organizationType, logoUrl) {
  const org = await getOrganizationForType(organizerId, organizationType)
  if (org.organizer_id !== organizerId) {
    throw new ApiError(403, 'Not allowed to update this organization')
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZATIONS)
    .update({ logo: logoUrl })
    .eq('id', org.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapOrganization(data)
}
