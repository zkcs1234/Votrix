// Phase 9 — refactored to use the shared `foundation/` audit helpers.
// The existing `createAuditLog` and `getAuditLogs` exports are kept as
// thin compatibility shims that delegate to `foundation/audit.js`, so
// callers (admin.controller.js) continue to work unchanged.

import { db, wrap } from '../foundation/db.js'
import { badRequest, notFound } from '../foundation/errors.js'
import { recordAudit, listAuditTrail } from '../foundation/audit.js'
import { mapAuditLog } from '../foundation/mapper.js'
import { DB_TABLES, USER_ROLES, ACCOUNT_STATUS } from '../utils/constants.js'

export async function getOrganizersList() {
  const usersQuery = db()
    .from(DB_TABLES.USERS)
    .select('id, email, created_at, updated_at, account_status')
    .eq('role', USER_ROLES.ORGANIZER)
    .order('created_at', { ascending: false })
  const users = await wrap(await usersQuery, { context: 'admin.getOrganizersList' })

  const orgsQuery = db()
    .from(DB_TABLES.ORGANIZATIONS)
    .select('id, organization_name, status, organizer_id')
  const orgs = await wrap(await orgsQuery, { context: 'admin.getOrganizersList.orgs' })

  return users.map((orgUser) => {
    const userOrgs = orgs.filter((o) => o.organizer_id === orgUser.id)
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
  const result = await db()
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
  return wrap(result, { context: 'admin.getGlobalEvents' })
}

export async function getSystemSettings() {
  const result = await db()
    .from(DB_TABLES.SYSTEM_SETTINGS)
    .select('*')
    .order('created_at', { ascending: true })
  return wrap(result, { context: 'admin.getSystemSettings' })
}

export async function saveSystemSetting(key, value, description = null) {
  const result = await db()
    .from(DB_TABLES.SYSTEM_SETTINGS)
    .upsert(
      { setting_key: key, setting_value: value, description },
      { onConflict: 'setting_key' },
    )
    .select()
    .single()
  return wrap(result, { context: 'admin.saveSystemSetting' })
}

/**
 * Fetch paginated, filterable audit logs.
 *
 * Accepted options are passed straight through to `listAuditTrail`:
 *   entity, entityId, action, search, startDate, endDate, limit, offset
 *
 * Returns `{ logs, total, page, limit }` so the controller can pass the
 * pagination metadata back to the client.
 */
export async function getAuditLogs({
  entity,
  entityId,
  action,
  search,
  startDate,
  endDate,
  limit = 50,
  offset = 0,
} = {}) {
  const { rows, total } = await listAuditTrail({
    entity,
    entityId,
    action,
    search,
    startDate,
    endDate,
    limit,
    offset,
  })
  return {
    logs: (rows ?? []).map(mapAuditLog),
    total,
  }
}

/**
 * Backward-compatibility shim. Delegates to foundation. The old signature
 * took a single `args` object, which is preserved.
 */
export async function createAuditLog({ userId, action, entity, entityId, details }) {
  return recordAudit({ userId, action, entity, entityId, details })
}

export async function updateOrganizerAccountStatus(organizerId, accountStatus) {
  if (!Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
    throw badRequest('Invalid account status')
  }

  const result = await db()
    .from(DB_TABLES.USERS)
    .update({ account_status: accountStatus })
    .eq('id', organizerId)
    .eq('role', USER_ROLES.ORGANIZER)
    .select('id, email, account_status')
    .single()
  const data = await wrap(result, { context: 'admin.updateOrganizerAccountStatus' })
  if (!data) throw notFound('Organizer not found')
  return data
}
