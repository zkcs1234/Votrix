import { ApiError } from '../utils/ApiError.js'

// Deployment remains opt-in until schema/ACL/backup checks are approved.
export function childCompetitionsEnabled() {
  return process.env.COMPETITION_CHILD_CONTEXTS_ENABLED === 'true'
}

export function resolveLegacyCompetitionContext(eventId, competitions, mapping) {
  if (!Array.isArray(competitions)) throw new ApiError(503, 'Competition context could not be verified')
  if (!competitions.length && !mapping) return { eventId, competitionId: null, kind: 'unmapped_legacy' }
  if (competitions.length !== 1) throw new ApiError(409, 'This event requires competition-scoped operations. Later-phase scoring integrations are not enabled.')
  const child = competitions[0]
  if (!mapping || mapping.event_id !== eventId || mapping.competition_id !== child.id || child.event_id !== eventId || child.origin !== 'legacy') throw new ApiError(409, 'An explicit legacy competition mapping is required for event-only operations')
  return { eventId, competitionId: child.id, kind: 'mapped_legacy' }
}

// Event-wide historical assignments NEVER become grants for native children.
// Later judge integration must add explicit competition assignments separately.
export function legacyPermissionApplies(eventId, competition, mapping) {
  return Boolean(competition?.origin === 'legacy' && competition.event_id === eventId && mapping?.event_id === eventId && mapping.competition_id === competition.id)
}
