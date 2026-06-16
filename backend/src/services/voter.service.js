import { listVoterElectionEvents } from './election.service.js'
import { listJudgeCompetitionEvents } from './pageant.service.js'
import { listVoterPollEvents } from './polling.service.js'

function isPollOpen(event) {
  if (!event.pollingEnabled) return false
  if (event.pollExpiresAt && new Date(event.pollExpiresAt) < new Date()) return false
  return true
}

function classifyElection(event) {
  let bucket = 'assigned'
  if (event.hasVoted) bucket = 'completed'
  else if (event.votingEnabled) bucket = 'active'

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    eventType: 'election',
    bucket,
    statusLabel: bucket === 'completed' ? 'Voted' : event.votingEnabled ? 'Voting open' : 'Waiting to open',
    actionPath: `/voter/events/${event.id}`,
    actionLabel:
      bucket === 'active' ? 'Cast vote' : bucket === 'completed' ? 'View ballot' : 'View event',
    votingEnabled: Boolean(event.votingEnabled),
    hasVoted: Boolean(event.hasVoted),
    eventStatus: event.status,
  }
}

function classifyCompetition(event) {
  let bucket = 'assigned'
  if (event.hasScored) bucket = 'completed'
  else if (event.scoringEnabled) bucket = 'active'

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    eventType: 'competition_scoring',
    bucket,
    statusLabel: bucket === 'completed' ? 'Scores submitted' : event.scoringEnabled ? 'Scoring open' : 'Waiting to open',
    actionPath: `/voter/competition/events/${event.id}/score`,
    actionLabel:
      bucket === 'active' ? 'Score contestants' : bucket === 'completed' ? 'View scores' : 'View event',
    scoringEnabled: Boolean(event.scoringEnabled),
    hasScored: Boolean(event.hasScored),
    eventStatus: event.status,
  }
}

function classifyPoll(event) {
  const open = isPollOpen(event)
  const canSubmitAgain = open && (!event.hasResponded || event.pollAllowMultipleSubmissions)

  let bucket = 'assigned'
  if (event.hasResponded && !canSubmitAgain) bucket = 'completed'
  else if (canSubmitAgain) bucket = 'active'

  let statusLabel = 'Waiting to open'
  if (!open && event.hasResponded) statusLabel = 'Responded'
  else if (!open) statusLabel = 'Poll closed'
  else if (canSubmitAgain && event.hasResponded) statusLabel = 'Open — submit again'
  else if (canSubmitAgain) statusLabel = 'Poll open'
  else if (event.hasResponded) statusLabel = 'Responded'

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    eventType: 'polling',
    bucket,
    statusLabel,
    actionPath: `/voter/polling/events/${event.id}`,
    actionLabel:
      bucket === 'active'
        ? event.hasResponded
          ? 'Submit again'
          : 'Take poll'
        : bucket === 'completed'
          ? 'View responses'
          : 'View poll',
    pollingEnabled: Boolean(event.pollingEnabled),
    pollExpiresAt: event.pollExpiresAt,
    pollAllowMultipleSubmissions: Boolean(event.pollAllowMultipleSubmissions),
    hasResponded: Boolean(event.hasResponded),
    pollOpen: open,
  }
}

export async function getVoterDashboard(voterId) {
  const [elections, competitions, polls] = await Promise.all([
    listVoterElectionEvents(voterId),
    listJudgeCompetitionEvents(voterId),
    listVoterPollEvents(voterId),
  ])

  const events = [
    ...elections.map(classifyElection),
    ...competitions.map(classifyCompetition),
    ...polls.map(classifyPoll),
  ]

  const byBucket = (bucket) => events.filter((e) => e.bucket === bucket)

  return {
    stats: {
      total: events.length,
      assigned: byBucket('assigned').length,
      active: byBucket('active').length,
      completed: byBucket('completed').length,
    },
    assigned: byBucket('assigned'),
    active: byBucket('active'),
    completed: byBucket('completed'),
    events,
  }
}

/**
 * Get the redirect path for a voter after login.
 * Returns the first active event, or first assigned event, or null.
 */
export async function getVoterLoginRedirect(voterId) {
  const dashboard = await getVoterDashboard(voterId)

  // Priority: active events first
  if (dashboard.active.length > 0) {
    const event = dashboard.active[0]
    return {
      path: event.actionPath,
      type: event.eventType,
      title: event.title,
    }
  }

  // If no active events, go to first assigned event
  if (dashboard.assigned.length > 0) {
    const event = dashboard.assigned[0]
    return {
      path: event.actionPath,
      type: event.eventType,
      title: event.title,
    }
  }

  // No events at all
  return null
}
