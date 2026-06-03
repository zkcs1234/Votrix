import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES, ACCOUNT_STATUS } from '../utils/constants.js'

function getClient() {
  const client = getSupabase()
  if (!client) {
    throw new ApiError(503, 'Database is not configured')
  }
  return client
}

export async function getOrganizersList() {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('id, email, created_at, updated_at, account_status')
    .eq('role', USER_ROLES.ORGANIZER)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)

  // Also fetch organization details for each organizer
  const { data: orgs, error: orgError } = await getClient()
    .from(DB_TABLES.ORGANIZATIONS)
    .select('id, organization_name, status, organizer_id')

  if (orgError) throw new ApiError(500, orgError.message)

  return data.map(orgUser => {
    const userOrgs = orgs.filter(o => o.organizer_id === orgUser.id)
    const organizationSummary = userOrgs.reduce(
      (acc, org) => {
        acc.total += 1
        acc[org.status] = (acc[org.status] ?? 0) + 1
        return acc
      },
      { total: 0, draft: 0, active: 0, inactive: 0, archived: 0 },
    )

    return {
      ...orgUser,
      organizations: userOrgs,
      organizationSummary,
    }
  })
}

export async function getGlobalEvents() {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select(`
      id, 
      title, 
      event_type, 
      status, 
      start_date, 
      end_date, 
      created_at,
      organization_id,
      organizations (
        organization_name
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function getSystemSettings() {
  const { data, error } = await getClient()
    .from(DB_TABLES.SYSTEM_SETTINGS)
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function saveSystemSetting(key, value, description = null) {
  const { data, error } = await getClient()
    .from(DB_TABLES.SYSTEM_SETTINGS)
    .upsert(
      { setting_key: key, setting_value: value, description },
      { onConflict: 'setting_key' }
    )
    .select()
    .single()

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function getAuditLogs() {
  const { data, error } = await getClient()
    .from(DB_TABLES.AUDIT_LOGS)
    .select(`
      id,
      action,
      entity,
      entity_id,
      details,
      created_at,
      user_id,
      users (
        email,
        role
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function createAuditLog({ userId, action, entity, entityId, details }) {
  const { error } = await getClient()
    .from(DB_TABLES.AUDIT_LOGS)
    .insert({
      user_id: userId,
      action,
      entity,
      entity_id: entityId,
      details
    })

  if (error) throw new ApiError(500, error.message)
}

export async function updateOrganizerAccountStatus(organizerId, accountStatus) {
  if (!Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
    throw new ApiError(400, 'Invalid account status')
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .update({ account_status: accountStatus })
    .eq('id', organizerId)
    .eq('role', USER_ROLES.ORGANIZER)
    .select('id, email, account_status')
    .single()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Organizer not found')

  return data
}
