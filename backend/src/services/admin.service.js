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
    .select('id, email, organization_name, organizer_name, position, organization_type_display, created_at, updated_at, account_status')
    .eq('role', USER_ROLES.ORGANIZER)
    .order('created_at', { ascending: false })
  const users = await wrap(await usersQuery, { context: 'admin.getOrganizersList' })

  const orgsQuery = db()
    .from(DB_TABLES.ORGANIZATIONS)
    .select('id, organization_name, status, organizer_id')
  const orgs = await wrap(await orgsQuery, { context: 'admin.getOrganizersList.orgs' })

  return users.map((orgUser) => {
    const userOrgs = orgs.filter((o) => o.organizer_id === orgUser.id)
    // Single organization per organizer model — simplified summary
    const org = userOrgs[0] ?? null

    // Check profile completeness
    const profileComplete = Boolean(
      orgUser.organization_name?.trim() &&
      orgUser.organization_type_display?.trim() &&
      orgUser.organizer_name?.trim() &&
      orgUser.position?.trim(),
    )

    return {
      id: orgUser.id,
      email: orgUser.email,
      account_status: orgUser.account_status,
      organization_name: orgUser.organization_name || '',
      organizer_name: orgUser.organizer_name || '',
      position: orgUser.position || '',
      organization_type_display: orgUser.organization_type_display || '',
      profile_complete: profileComplete,
      created_at: orgUser.created_at,
      updated_at: orgUser.updated_at,
      organizationName: org?.organization_name ?? 'My Organization',
      organization: org,
      organizationSummary: {
        total: userOrgs.length > 0 ? 1 : 0,
        draft: org?.status === 'draft' ? 1 : 0,
        active: org?.status === 'active' ? 1 : 0,
        inactive: org?.status === 'inactive' ? 1 : 0,
        archived: org?.status === 'archived' ? 1 : 0,
      },
    }
  })
}

/**
 * Send an onboarding notification email to an organizer.
 * Reminds them to complete their organization profile.
 */
export async function sendOnboardingNotification(organizerId) {
  const result = await db()
    .from(DB_TABLES.USERS)
    .select('id, email, organization_name, organizer_name, position, organization_type_display')
    .eq('id', organizerId)
    .eq('role', USER_ROLES.ORGANIZER)
    .single()

  const user = await wrap(result, { context: 'admin.sendOnboardingNotification' })
  if (!user) throw notFound('Organizer not found')

  // Check if profile is already complete
  const profileComplete = Boolean(
    user.organization_name?.trim() &&
    user.organization_type_display?.trim() &&
    user.organizer_name?.trim() &&
    user.position?.trim(),
  )

  if (profileComplete) {
    throw badRequest('Organizer profile is already complete')
  }

  // Send onboarding email
  const { sendOrganizerOnboardingEmail } = await import('./mailer.service.js')
  const emailResult = await sendOrganizerOnboardingEmail({
    email: user.email,
  })

  return { email: emailResult }
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
