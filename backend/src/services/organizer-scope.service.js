import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, ORGANIZER_SCOPE_TYPES } from '../utils/constants.js'

// Phase A of ORGANIZER_REGISTRATION_AND_SCOPING_PLAN.md.
// Resolves an organizer's voter scope and provides the predicates/filters that
// later phases use to bound the cohort picker, invite guard, enrolled lists,
// analytics and dashboards (decision O9). Judges are NOT scoped here — they are
// a global pool and each organizer picks the judges for their own events.

const ALL_ACCESS = { scopeType: ORGANIZER_SCOPE_TYPES.ALL, programs: [] }

function toList(value) {
  return Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : []
}

// Normalize any stored/absent scope into a predictable shape. A missing scope
// (e.g. a legacy organizer not yet backfilled) is treated as all-access so no
// one is accidentally locked out.
export function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object') return { ...ALL_ACCESS }
  if (scope.scopeType !== ORGANIZER_SCOPE_TYPES.SCOPED) return { ...ALL_ACCESS }
  return {
    scopeType: ORGANIZER_SCOPE_TYPES.SCOPED,
    programs: toList(scope.programs),
  }
}

export function isAllAccess(scope) {
  return normalizeScope(scope).scopeType === ORGANIZER_SCOPE_TYPES.ALL
}

// Fetch and normalize an organizer's scope. All-access when unset.
export async function getOrganizerScope(organizerId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('scope')
    .eq('id', organizerId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  return normalizeScope(data?.scope)
}

// Does a given student (by program) fall inside the scope? A scoped organizer
// sees only the programs on their list; a scoped scope with an empty list (the
// admin forms no longer allow it, but older rows may exist) sees no students,
// never everyone.
export function isStudentInScope(scope, { program } = {}) {
  const s = normalizeScope(scope)
  if (s.scopeType === ORGANIZER_SCOPE_TYPES.ALL) return true
  return s.programs.includes(program)
}

// Are the given program values all inside scope? Used by the invite guard so an
// organizer cannot invite a program they don't own.
export function areCohortValuesInScope(scope, values) {
  const s = normalizeScope(scope)
  if (s.scopeType === ORGANIZER_SCOPE_TYPES.ALL) return true
  return toList(values).every((v) => s.programs.includes(v))
}

// Filter the cohort list down to the programs the organizer may see.
export function filterCohortsForScope(scope, { programs = [] } = {}) {
  const s = normalizeScope(scope)
  if (s.scopeType === ORGANIZER_SCOPE_TYPES.ALL) return { programs }
  return { programs: programs.filter((p) => s.programs.includes(p.value ?? p)) }
}

// Counting enrolled students in SQL. A query on event_participants must select
// `users!inner(program)` for applyStudentScope to filter on it; scopedSelect adds
// that join only when the scope actually restricts students.
export function scopedSelect(scope, columns = '*') {
  return isAllAccess(scope) ? columns : `${columns}, users!inner(program)`
}

export function applyStudentScope(query, scope) {
  const s = normalizeScope(scope)
  if (s.scopeType === ORGANIZER_SCOPE_TYPES.ALL) return query
  return query.in('users.program', s.programs)
}
