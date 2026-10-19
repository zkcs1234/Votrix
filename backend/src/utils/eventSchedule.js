/**
 * Shared event schedule helpers for voting, polling, and scoring windows.
 */

export const CLOCK_SKEW_TOLERANCE_MS = 30_000

export function isWithinEventSchedule(event, now = new Date(), skewToleranceMs = CLOCK_SKEW_TOLERANCE_MS) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (event.start_date && new Date(event.start_date).getTime() > nowMs + skewToleranceMs) return false
  if (event.end_date && new Date(event.end_date).getTime() < nowMs - skewToleranceMs) return false
  return true
}

export function isElectionVotingOpen(event, now = new Date(), skewToleranceMs = CLOCK_SKEW_TOLERANCE_MS) {
  if (!event.voting_enabled) return false
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (event.start_date && new Date(event.start_date).getTime() > nowMs + skewToleranceMs) return false
  if (event.end_date && new Date(event.end_date).getTime() < nowMs - skewToleranceMs) return false
  if (event.status === 'active') return true
  return isWithinEventSchedule(event, now, skewToleranceMs)
}

export function isPollOpen(event, now = new Date(), skewToleranceMs = CLOCK_SKEW_TOLERANCE_MS) {
  if (!event.polling_enabled) return false
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (event.poll_expires_at && new Date(event.poll_expires_at).getTime() < nowMs - skewToleranceMs) return false
  if (event.start_date && new Date(event.start_date).getTime() > nowMs + skewToleranceMs) return false
  if (event.end_date && new Date(event.end_date).getTime() < nowMs - skewToleranceMs) return false
  if (event.status === 'active') return true
  return isWithinEventSchedule(event, now, skewToleranceMs)
}

export function isCompetitionScoringOpen(event, now = new Date(), skewToleranceMs = CLOCK_SKEW_TOLERANCE_MS) {
  if (!event.scoring_enabled) return false
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (event.start_date && new Date(event.start_date).getTime() > nowMs + skewToleranceMs) return false
  if (event.end_date && new Date(event.end_date).getTime() < nowMs - skewToleranceMs) return false
  if (event.status === 'active') return true
  return isWithinEventSchedule(event, now, skewToleranceMs)
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
