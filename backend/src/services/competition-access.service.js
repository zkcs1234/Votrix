import { db } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'

// Shared by live views, drafts, locks, submissions, corrections and tabulation.
export function allowsScoring(participant, assignments, { eventId, roundId, categoryId, divisionId }) {
  if (!participant || participant.is_active === false || !['judge', 'head_judge'].includes(participant.judge_role ?? 'judge')) return false
  if (participant.users?.account_status !== 'active') return false
  if (!assignments.length) return true
  return assignments.some(a =>
    (a.scope === 'event' && a.scope_id === eventId) ||
    (a.scope === 'round' && a.scope_id === roundId) ||
    (a.scope === 'category' && a.scope_id === categoryId) ||
    (a.scope === 'division' && a.scope_id === divisionId))
}

export async function judgeAccess(eventId, userId) {
  const { data: participant, error } = await db().from('event_participants')
    .select('*, users!inner(id,account_status,role)').eq('event_id', eventId).eq('user_id', userId)
    .eq('participant_type', 'COMPETITION_JUDGE').maybeSingle()
  if (error) throw new ApiError(503, 'Unable to verify judge enrollment')
  const { data: assignments, error: assignmentError } = participant
    ? await db().from('competition_judge_assignments').select('*').eq('participant_id', participant.id)
    : { data: [], error: null }
  if (assignmentError) throw new ApiError(503, 'Unable to verify judge assignments')
  if (!allowsScoring(participant, [], { eventId })) throw new ApiError(403, 'An active scoring judge enrollment is required')
  return { participant, assignments: assignments ?? [], permits: context => allowsScoring(participant, assignments ?? [], { eventId, ...context }) }
}
