import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, ORGANIZER_SCOPE_TYPES } from '../utils/constants.js'

// Phase A of ORGANIZER_REGISTRATION_AND_SCOPING_PLAN.md.
// Resolves an organizer's voter scope and provides the predicates/filters that
// later phases use to bound the cohort picker, invite guard, enrolled lists,
// analytics and dashboards (decision O9). Judges are NOT scoped here — they use
// the admin-assigned mapping in the judge's profile_data (decision O7).

const ALL_ACCESS = { scopeType: ORGANIZER_SCOPE_TYPES.ALL, programs: [], sections: [] }

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
    sections: toList(scope.sections),
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

// Does a given student (program / year_section) fall inside the scope?
export function isStudentInScope(scope, { program, yearSection } = {}) {
  const s = normalizeScope(scope)
  if (s.scopeType === ORGANIZER_SCOPE_TYPES.ALL) return true
  if (s.programs.length && !s.programs.includes(program)) return false
  if (s.sections.length && !s.sections.includes(yearSection)) return false
  return true
}

// Are the given cohort values (of one dimension) all inside scope? Used by the
// invite guard so an organizer cannot invite a program/section they don't own.
export function areCohortValuesInScope(scope, cohortType, values) {
  const s = normalizeScope(scope)
  if (s.scopeType === ORGANIZER_SCOPE_TYPES.ALL) return true
  const allowed = cohortType === 'program' ? s.programs : s.sections
  // An empty allowed-list for that dimension means "not constrained on it".
  if (!allowed.length) return true
  return toList(values).every((v) => allowed.includes(v))
}

// Filter the taxonomy-derived cohort lists down to what the organizer may see.
export function filterCohortsForScope(scope, { programs = [], sections = [] } = {}) {
  const s = normalizeScope(scope)
  if (s.scopeType === ORGANIZER_SCOPE_TYPES.ALL) return { programs, sections }
  return {
    programs: s.programs.length ? programs.filter((p) => s.programs.includes(p.value ?? p)) : programs,
    sections: s.sections.length ? sections.filter((sec) => s.sections.includes(sec.value ?? sec)) : sections,
  }
}
