/**
 * Shared event schedule helpers for voting, polling, and scoring windows.
 */

export function isWithinEventSchedule(event, now = new Date()) {
  if (event.start_date && new Date(event.start_date) > now) return false
  if (event.end_date && new Date(event.end_date) < now) return false
  return true
}

export function isElectionVotingOpen(event, now = new Date()) {
  return Boolean(event.voting_enabled) && isWithinEventSchedule(event, now)
}

export function isPollOpen(event, now = new Date()) {
  if (!event.polling_enabled) return false
  if (event.poll_expires_at && new Date(event.poll_expires_at) < now) return false
  return isWithinEventSchedule(event, now)
}

export function isCompetitionScoringOpen(event, now = new Date()) {
  return Boolean(event.scoring_enabled) && isWithinEventSchedule(event, now)
}

/**
 * Whether an enrolled voter may view election results (voter-facing visibility).
 * - hidden: never
 * - real_time: while enrolled (including during voting)
 * - public: only after voting closes
 */
export function canVoterViewElectionResults(event, now = new Date()) {
  const visibility = event.results_visibility ?? event.resultsVisibility ?? 'public'
  if (visibility === 'hidden') return false
  if (visibility === 'real_time') return true
  return !isElectionVotingOpen(event, now)
}
