/**
 * Shared event schedule helpers for voting, polling, and scoring windows.
 */

export function isWithinEventSchedule(event, now = new Date()) {
  if (event.start_date && new Date(event.start_date) > now) return false
  if (event.end_date && new Date(event.end_date) < now) return false
  return true
}

export function isElectionVotingOpen(event, now = new Date()) {
  if (!event.voting_enabled) return false
  // Schedule is authoritative: voting can never be open before the scheduled
  // start or after the scheduled end, even when an organizer has manually
  // enabled voting (which sets status to 'active'). A future start_date holds
  // voting closed until it arrives; enabling voting early only "arms" it.
  if (event.start_date && new Date(event.start_date) > now) return false
  if (event.end_date && new Date(event.end_date) < now) return false
  // Past the start (or no start_date set) and within the window: a manual
  // toggle (status 'active') opens voting immediately; otherwise fall back to
  // the full schedule check.
  if (event.status === 'active') return true
  return isWithinEventSchedule(event, now)
}

export function isPollOpen(event, now = new Date()) {
  if (!event.polling_enabled) return false
  if (event.poll_expires_at && new Date(event.poll_expires_at) < now) return false
  // Schedule is authoritative: a poll can never be open before its scheduled
  // start or after its scheduled end, even when an organizer has manually
  // enabled polling (which sets status to 'active'). A future start_date holds
  // the poll closed until it arrives; enabling early only "arms" it. (Mirrors
  // isElectionVotingOpen — see that function for the rationale.)
  if (event.start_date && new Date(event.start_date) > now) return false
  if (event.end_date && new Date(event.end_date) < now) return false
  if (event.status === 'active') return true
  return isWithinEventSchedule(event, now)
}

export function isCompetitionScoringOpen(event, now = new Date()) {
  if (!event.scoring_enabled) return false
  // Schedule is authoritative (see isElectionVotingOpen / isPollOpen): a future
  // start_date holds scoring closed even when manually enabled.
  if (event.start_date && new Date(event.start_date) > now) return false
  if (event.end_date && new Date(event.end_date) < now) return false
  if (event.status === 'active') return true
  return isWithinEventSchedule(event, now)
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
  // public: reveal only once the election has genuinely concluded — not while
  // it is merely paused (voting toggled off mid-election), and not before it
  // has started. "Concluded" = the scheduled end has passed, or the organizer
  // has finalized/closed/archived the election. Gating on a transient voting
  // flag (the old `!isElectionVotingOpen`) leaked partial results on pause.
  const endPassed = Boolean(event.end_date && new Date(event.end_date) < now)
  const lifecycle = event.election_status ?? null
  const finalized =
    event.status === 'completed' ||
    lifecycle === 'finalized' ||
    lifecycle === 'closed' ||
    lifecycle === 'archived'
  return endPassed || finalized
}
