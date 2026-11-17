import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES, ORGANIZER_SCOPE_TYPES } from '../utils/constants.js'
import { sanitizeUser } from '../utils/userMapper.js'
import { createOrganizer } from './user.service.js'
import { listActivePrograms } from './program.service.js'

// Phase B of ORGANIZER_REGISTRATION_AND_SCOPING_PLAN.md.
// Admin-owned organizer account creation (used when an invitation application
// is approved) with a full profile and a voter scope, so organizers never see
// an onboarding step. Scope programs are validated + canonicalized against the
// programs table. There is no CSV import: organizers join by invitation.

import { EMAIL_RE } from '../../../shared/form-rules.js'

// A programs value may arrive as one string separated by ; | or ,. Split on any of them.
export function splitMulti(value) {
  return String(value ?? '')
    .split(/[;|,]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

// Case-insensitive program matcher → canonical spelling (or null if unknown).
export function programMatchers({ programs }) {
  return { programMap: new Map(programs.map((v) => [v.toLowerCase(), v])) }
}

// Load the valid programs from the programs table, ready for programMatchers().
async function loadProgramList() {
  return { programs: await listActivePrograms() }
}

// Validate + canonicalize a raw scope against the programs list. Returns { scope, errors }.
export function buildScope({ scopeTypeRaw, programsRaw }, matchers) {
  const errors = []
  const wantsScoped = String(scopeTypeRaw ?? '').trim().toLowerCase() === ORGANIZER_SCOPE_TYPES.SCOPED ||
    // Treat "programs present but no explicit type" as scoped.
    (!scopeTypeRaw && programsRaw?.length)

  if (!wantsScoped) {
    return { scope: { scopeType: ORGANIZER_SCOPE_TYPES.ALL, programs: [] }, errors }
  }

  const programs = []
  for (const p of programsRaw ?? []) {
    const canonical = matchers.programMap.get(p.toLowerCase())
    if (!canonical) errors.push(`program "${p}" is not in the managed list`)
    else programs.push(canonical)
  }
  // Recommendation from the plan: a scoped organizer must have at least one program.
  if (!programs.length) errors.push('a scoped organizer needs at least one program')

  return { scope: { scopeType: ORGANIZER_SCOPE_TYPES.SCOPED, programs }, errors }
}

// ---------------------------------------------------------------------------
// Listing (organizers with profile + scope)
// ---------------------------------------------------------------------------
export async function listOrganizers() {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('role', USER_ROLES.ORGANIZER)
    .order('created_at', { ascending: false })
  if (error) throw new ApiError(500, error.message)
  return { organizers: (data ?? []).map(sanitizeUser) }
}

// ---------------------------------------------------------------------------
// Create (called when an invitation application is approved)
// ---------------------------------------------------------------------------
export async function createOrganizerAccount(input) {
  const row = {
    email: String(input?.email ?? '').trim().toLowerCase(),
    organizer_name: String(input?.organizerName ?? '').trim(),
    position: String(input?.position ?? '').trim(),
    organization_name: String(input?.organizationName ?? '').trim(),
    organization_type: String(input?.organizationType ?? '').trim(),
  }
  const errors = []
  if (!row.email) errors.push('email is required')
  else if (!EMAIL_RE.test(row.email)) errors.push('invalid email')
  for (const f of ['organizer_name', 'position', 'organization_name', 'organization_type']) {
    if (!row[f]) errors.push(`${f.replace(/_/g, ' ')} is required`)
  }

  const { scope, errors: scopeErrors } = buildScope(
    {
      scopeTypeRaw: input?.scopeType,
      programsRaw: Array.isArray(input?.programs) ? input.programs : splitMulti(input?.programs),
    },
    programMatchers(await loadProgramList()),
  )
  errors.push(...scopeErrors)
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })

  const { user, email } = await createOrganizer({
    email: row.email,
    organizerName: row.organizer_name,
    position: row.position,
    organizationName: row.organization_name,
    organizationType: row.organization_type,
    scope,
  })
  return { user, email }
}

// ---------------------------------------------------------------------------
// Edit profile + scope
// ---------------------------------------------------------------------------
export async function updateOrganizer(userId, input) {
  const { data: current, error: curErr } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('id', userId)
    .eq('role', USER_ROLES.ORGANIZER)
    .maybeSingle()
  if (curErr) throw new ApiError(500, curErr.message)
  if (!current) throw new ApiError(404, 'Organizer not found')

  const updates = {}
  if (input?.organizerName !== undefined) updates.organizer_name = String(input.organizerName).trim()
  if (input?.position !== undefined) updates.position = String(input.position).trim()
  if (input?.organizationName !== undefined) updates.organization_name = String(input.organizationName).trim()
  if (input?.organizationType !== undefined) updates.organization_type_display = String(input.organizationType).trim()

  if (input?.scopeType !== undefined || input?.programs !== undefined) {
    const { scope, errors } = buildScope(
      {
        scopeTypeRaw: input?.scopeType ?? current.scope?.scopeType,
        programsRaw: Array.isArray(input?.programs) ? input.programs : splitMulti(input?.programs),
      },
      programMatchers(await loadProgramList()),
    )
    if (errors.length) throw new ApiError(400, 'Validation failed', { errors })
    updates.scope = scope
  }

  if (Object.keys(updates).length === 0) throw new ApiError(400, 'No fields to update')

  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .update(updates)
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return { user: sanitizeUser(data) }
}

