import { db as getClient } from '../foundation/db.js'
import { recordAudit } from '../foundation/audit.js'
import { badRequest, conflict, forbidden, notFound } from '../foundation/errors.js'
import { ApiError } from '../utils/ApiError.js'
import {
  ACCOUNT_STATUS,
  DB_TABLES,
  OFFICER_STATUS,
  ORGANIZER_SCOPE_TYPES,
  PARTICIPANT_TYPES,
  USER_ROLES,
} from '../utils/constants.js'
import { validateUUID } from '../utils/sanitize.js'
import { getOrganizerScope, isStudentInScope, normalizeScope } from './organizer-scope.service.js'

// Plan docs/plans/organizer-invitation-and-student-officers-plan.md §5.
//
// An officer is a student the owner organizer has assigned to work inside the
// organizer workspace AS that organizer. Membership is read from the database on
// every request — nothing here is cached — so deactivation is immediate.

const MAX_POSITION = 255
const PG_UNIQUE_VIOLATION = '23505'

// Same eligibility rule the admin student list uses: an active STUDENT
// membership on a participant account. (profile_type is not reliable here —
// newly registered students do not get it set.)
const STUDENT_SELECT = '*, user_participant_types!user_participant_types_user_id_fkey!inner(participant_type, is_active)'

function nowIso() {
  return new Date().toISOString()
}

function normalizePosition(raw) {
  const position = String(raw ?? '').trim()
  if (!position) throw badRequest('Validation failed', { errors: ['position is required'] })
  if (position.length > MAX_POSITION) {
    throw badRequest('Validation failed', { errors: [`position must be ${MAX_POSITION} characters or fewer`] })
  }
  return position
}

function toStudentDto(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    schoolId: row.school_id ?? null,
    program: row.program ?? null,
  }
}

function toOfficerDto(row, student) {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    studentId: row.student_id,
    position: row.position,
    status: row.status,
    assignedBy: row.assigned_by ?? null,
    assignedAt: row.assigned_at ?? null,
    deactivatedBy: row.deactivated_by ?? null,
    deactivatedAt: row.deactivated_at ?? null,
    student: toStudentDto(student),
  }
}

// Best-effort notification: assigning an officer must never fail because an email
// could not be sent. The outcome is returned so the UI can say so.
async function notifyOfficerAssigned({ organizerId, student, position }) {
  try {
    const { data: owner } = await getClient()
      .from(DB_TABLES.USERS)
      .select('organization_name')
      .eq('id', organizerId)
      .maybeSingle()
    // Imported lazily (like user.service does) so the auth/websocket paths that
    // import this module do not pull in the mail stack.
    const { sendOfficerAssignedEmail } = await import('./mailer.service.js')
    return await sendOfficerAssignedEmail({
      email: student.email,
      studentName: [student.first_name, student.last_name].filter(Boolean).join(' ') || null,
      organizationName: owner?.organization_name ?? null,
      position,
    })
  } catch (err) {
    console.warn('[officer] assignment email failed (non-fatal):', err.message)
    return { sent: false, error: err.message }
  }
}

async function loadStudentsByIds(ids) {
  if (!ids.length) return new Map()
  const { data, error } = await getClient().from(DB_TABLES.USERS).select('*').in('id', ids)
  if (error) throw new ApiError(500, error.message)
  return new Map((data ?? []).map((u) => [u.id, u]))
}

async function loadOfficer(organizerId, officerId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZATION_OFFICERS)
    .select('*')
    .eq('id', officerId)
    .eq('organizer_id', organizerId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw notFound('Officer not found')
  return data
}

// An ACTIVE, eligible student account. 404 for anything else so the endpoint
// does not reveal why an id was rejected.
async function loadEligibleStudent(studentId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select(STUDENT_SELECT)
    .eq('id', studentId)
    .eq('user_participant_types.participant_type', PARTICIPANT_TYPES.STUDENT)
    .eq('user_participant_types.is_active', true)
    .in('role', [USER_ROLES.PARTICIPANT, USER_ROLES.VOTER])
    .eq('account_status', ACCOUNT_STATUS.ACTIVE)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw notFound('Student not found')
  return data
}

async function assertInScope(organizerId, student) {
  const scope = await getOrganizerScope(organizerId)
  if (!isStudentInScope(scope, { program: student.program })) {
    throw forbidden('This student is outside your access scope')
  }
}

// ---------------------------------------------------------------------------
// Resolution (used by the request middleware, /auth/me and WebSocket auth)
// ---------------------------------------------------------------------------
export async function findActiveOfficership(studentId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZATION_OFFICERS)
    .select('*')
    .eq('student_id', studentId)
    .eq('status', OFFICER_STATUS.ACTIVE)
    .maybeSingle()
  // Never fail open: a database error must not be read as "not an officer" by
  // callers that grant access, so it surfaces as an error.
  if (error) throw new ApiError(500, error.message)
  return data ?? null
}

/** The student's active officership plus its owner account, or null. */
export async function resolveOfficerContext(studentId) {
  const officership = await findActiveOfficership(studentId)
  if (!officership) return null

  const { data: owner, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('id', officership.organizer_id)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  return { officership, owner: owner ?? null }
}

// ---------------------------------------------------------------------------
// Owner operations
// ---------------------------------------------------------------------------
export async function listOfficers(organizerId, { status = 'all' } = {}) {
  if (!['all', OFFICER_STATUS.ACTIVE, OFFICER_STATUS.INACTIVE].includes(status)) {
    throw badRequest('status must be active, inactive or all')
  }

  let query = getClient()
    .from(DB_TABLES.ORGANIZATION_OFFICERS)
    .select('*')
    .eq('organizer_id', organizerId)
    .order('assigned_at', { ascending: false })
  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new ApiError(500, error.message)

  const rows = data ?? []
  const students = await loadStudentsByIds(rows.map((r) => r.student_id))
  return { officers: rows.map((r) => toOfficerDto(r, students.get(r.student_id))) }
}

/**
 * Students the owner may assign: eligible, active, inside the owner's scope, and
 * not already an active officer anywhere (one active officership per student).
 */
export async function listCandidates(organizerId, { search, limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 50)
  const scope = normalizeScope(await getOrganizerScope(organizerId))

  const taken = await getClient()
    .from(DB_TABLES.ORGANIZATION_OFFICERS)
    .select('student_id')
    .eq('status', OFFICER_STATUS.ACTIVE)
  if (taken.error) throw new ApiError(500, taken.error.message)
  const takenIds = new Set((taken.data ?? []).map((r) => r.student_id))

  let query = getClient()
    .from(DB_TABLES.USERS)
    .select(STUDENT_SELECT)
    .eq('user_participant_types.participant_type', PARTICIPANT_TYPES.STUDENT)
    .eq('user_participant_types.is_active', true)
    .in('role', [USER_ROLES.PARTICIPANT, USER_ROLES.VOTER])
    .eq('account_status', ACCOUNT_STATUS.ACTIVE)

  if (scope.scopeType === ORGANIZER_SCOPE_TYPES.SCOPED) {
    // An empty program list matches no one (same rule as isStudentInScope).
    query = query.in('program', scope.programs)
  }

  if (search) {
    // Strip characters that would break the PostgREST `or` filter grammar.
    const s = String(search).replace(/[,()%]/g, '').trim()
    if (s) {
      query = query.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,school_id.ilike.%${s}%`)
    }
  }

  // Over-fetch by the number of already-assigned students, then drop them, so a
  // page is never short just because some students are taken.
  query = query.order('last_name', { ascending: true }).range(0, safeLimit + takenIds.size - 1)

  const { data, error } = await query
  if (error) throw new ApiError(500, error.message)

  const candidates = (data ?? []).filter((u) => !takenIds.has(u.id)).slice(0, safeLimit).map(toStudentDto)
  return { candidates }
}

export async function assignOfficer(organizerId, { studentId, position }, assignedBy) {
  const cleanPosition = normalizePosition(position)
  validateUUID(studentId, 'studentId')

  const student = await loadEligibleStudent(studentId)
  await assertInScope(organizerId, student)

  const active = await findActiveOfficership(studentId)
  if (active) {
    throw conflict(
      active.organizer_id === organizerId
        ? 'This student is already an active officer'
        : 'This student is already an officer of another organization',
    )
  }

  const existing = await getClient()
    .from(DB_TABLES.ORGANIZATION_OFFICERS)
    .select('*')
    .eq('organizer_id', organizerId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (existing.error) throw new ApiError(500, existing.error.message)

  const fields = {
    position: cleanPosition,
    status: OFFICER_STATUS.ACTIVE,
    assigned_by: assignedBy ?? organizerId,
    assigned_at: nowIso(),
    deactivated_by: null,
    deactivated_at: null,
    updated_at: nowIso(),
  }

  const write = existing.data
    ? getClient().from(DB_TABLES.ORGANIZATION_OFFICERS).update(fields).eq('id', existing.data.id).select('*').maybeSingle()
    : getClient()
        .from(DB_TABLES.ORGANIZATION_OFFICERS)
        .insert({ organizer_id: organizerId, student_id: studentId, ...fields })
        .select('*')
        .single()
  const { data, error } = await write
  if (error) {
    // Two concurrent assignments: the partial unique index is the final arbiter.
    if (error.code === PG_UNIQUE_VIOLATION) throw conflict('This student is already an active officer')
    throw new ApiError(500, error.message)
  }

  recordAudit({
    userId: organizerId,
    action: existing.data ? 'organizer.officer.reassign' : 'organizer.officer.assign',
    entity: DB_TABLES.ORGANIZATION_OFFICERS,
    entityId: data.id,
    details: { studentId, position: cleanPosition },
  })
  const email = await notifyOfficerAssigned({ organizerId, student, position: cleanPosition })
  return { officer: toOfficerDto(data, student), email }
}

export async function updateOfficerPosition(organizerId, officerId, rawPosition) {
  const position = normalizePosition(rawPosition)
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZATION_OFFICERS)
    .update({ position, updated_at: nowIso() })
    .eq('id', officerId)
    .eq('organizer_id', organizerId)
    .select('*')
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw notFound('Officer not found')

  recordAudit({
    userId: organizerId,
    action: 'organizer.officer.position',
    entity: DB_TABLES.ORGANIZATION_OFFICERS,
    entityId: officerId,
    details: { studentId: data.student_id, position },
  })
  const students = await loadStudentsByIds([data.student_id])
  return { officer: toOfficerDto(data, students.get(data.student_id)) }
}

/**
 * Deactivate (single conditional UPDATE, so it is idempotent-safe). `byAdmin`
 * marks an administrator override for the audit trail.
 */
export async function deactivateOfficer(organizerId, officerId, deactivatedBy, { byAdmin = false } = {}) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZATION_OFFICERS)
    .update({
      status: OFFICER_STATUS.INACTIVE,
      deactivated_by: deactivatedBy ?? null,
      deactivated_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', officerId)
    .eq('organizer_id', organizerId)
    .eq('status', OFFICER_STATUS.ACTIVE)
    .select('*')
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)

  if (!data) {
    await loadOfficer(organizerId, officerId) // 404 when it does not exist
    throw conflict('This officer is already inactive')
  }

  recordAudit({
    userId: deactivatedBy ?? organizerId,
    action: 'organizer.officer.deactivate',
    entity: DB_TABLES.ORGANIZATION_OFFICERS,
    entityId: officerId,
    details: { studentId: data.student_id, organizerId, byAdmin },
  })
  const students = await loadStudentsByIds([data.student_id])
  return { officer: toOfficerDto(data, students.get(data.student_id)) }
}

export async function activateOfficer(organizerId, officerId, activatedBy) {
  const row = await loadOfficer(organizerId, officerId)
  if (row.status === OFFICER_STATUS.ACTIVE) throw conflict('This officer is already active')

  // Re-check everything assignment checks: the student may have been archived,
  // moved out of scope, or taken on by another organization since.
  const student = await loadEligibleStudent(row.student_id)
  await assertInScope(organizerId, student)
  const active = await findActiveOfficership(row.student_id)
  if (active) throw conflict('This student is already an officer of another organization')

  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZATION_OFFICERS)
    .update({
      status: OFFICER_STATUS.ACTIVE,
      assigned_by: activatedBy ?? organizerId,
      assigned_at: nowIso(),
      deactivated_by: null,
      deactivated_at: null,
      updated_at: nowIso(),
    })
    .eq('id', officerId)
    .eq('organizer_id', organizerId)
    .eq('status', OFFICER_STATUS.INACTIVE)
    .select('*')
    .maybeSingle()
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) throw conflict('This student is already an officer of another organization')
    throw new ApiError(500, error.message)
  }
  if (!data) throw conflict('This officer is already active')

  recordAudit({
    userId: organizerId,
    action: 'organizer.officer.activate',
    entity: DB_TABLES.ORGANIZATION_OFFICERS,
    entityId: officerId,
    details: { studentId: row.student_id },
  })
  const email = await notifyOfficerAssigned({ organizerId, student, position: data.position })
  return { officer: toOfficerDto(data, student), email }
}

// ---------------------------------------------------------------------------
// Admin override (read + deactivate)
// ---------------------------------------------------------------------------
export async function adminListOfficers(organizerId) {
  return listOfficers(organizerId, { status: 'all' })
}

export async function adminDeactivateOfficer(organizerId, officerId, adminId) {
  return deactivateOfficer(organizerId, officerId, adminId, { byAdmin: true })
}

/** Shape sent to the client in /auth/me for an active officer. */
export function toOfficershipDto({ officership, owner }) {
  return {
    organizerId: officership.organizer_id,
    organizationName: owner?.organization_name ?? null,
    organizerName: owner?.organizer_name ?? null,
    position: officership.position,
  }
}
