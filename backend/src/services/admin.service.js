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
  const users = await wrap(
    db()
      .from(DB_TABLES.USERS)
      .select('id, email, created_at, updated_at, account_status')
      .eq('role', USER_ROLES.ORGANIZER)
      .order('created_at', { ascending: false }),
    { context: 'admin.getOrganizersList' },
  )

  const orgs = await wrap(
    db()
      .from(DB_TABLES.ORGANIZATIONS)
      .select('id, organization_name, status, organizer_id'),
    { context: 'admin.getOrganizersList.orgs' },
  )

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
  return wrap(
    db()
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
      .order('created_at', { ascending: false }),
    { context: 'admin.getGlobalEvents' },
  )
}

export async function getSystemSettings() {
  return wrap(
    db()
      .from(DB_TABLES.SYSTEM_SETTINGS)
      .select('*')
      .order('created_at', { ascending: true }),
    { context: 'admin.getSystemSettings' },
  )
}

export async function saveSystemSetting(key, value, description = null) {
  return wrap(
    db()
      .from(DB_TABLES.SYSTEM_SETTINGS)
      .upsert(
        { setting_key: key, setting_value: value, description },
        { onConflict: 'setting_key' },
      )
      .select()
      .single(),
    { context: 'admin.saveSystemSetting' },
  )
}

/**
 * Backward-compatibility shim. New code should call
 * `listAuditTrail({ entity, entityId, limit })` from `foundation/audit.js`
 * directly. The returned rows are mapped with the shared `mapAuditLog`
 * helper for consistency.
 */
export async function getAuditLogs({ limit = 100 } = {}) {
  const rows = await listAuditTrail({ limit })
  return (rows ?? []).map(mapAuditLog)
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

  const data = await wrap(
    db()
      .from(DB_TABLES.USERS)
      .update({ account_status: accountStatus })
      .eq('id', organizerId)
      .eq('role', USER_ROLES.ORGANIZER)
      .select('id, email, account_status')
      .single(),
    { context: 'admin.updateOrganizerAccountStatus' },
  )
  if (!data) throw notFound('Organizer not found')
  return data
}
