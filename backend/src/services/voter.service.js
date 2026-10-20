import { listVoterElectionEvents, getVoterElectionResults } from './election.service.js'
import { listJudgeCompetitionEvents } from './pageant.service.js'
import { listVoterPollEvents } from './polling.service.js'
import { enrichEventWithParticipantType } from './participant.service.js'
import { PARTICIPANT_TYPES } from '../utils/constants.js'
import {
  canVoterViewElectionResults,
  isCompetitionScoringOpen,
  isElectionVotingOpen,
  isPollOpen as isPollOpenForSchedule,
} from '../utils/eventSchedule.js'

function isPollOpen(event) {
  return isPollOpenForSchedule({
    polling_enabled: event.pollingEnabled,
    poll_expires_at: event.pollExpiresAt,
    start_date: event.startDate,
    end_date: event.endDate,
    status: event.status,
  })
}

function extractOrganizationName(org) {
  if (!org) return null
  if (typeof org === 'string') return org
  return org.name || org.organizationName || null
}

function classifyElection(event) {
  let bucket = 'assigned'
  if (event.hasVoted) bucket = 'completed'
  else if (isElectionVotingOpen({
    voting_enabled: event.votingEnabled,
    start_date: event.startDate,
    end_date: event.endDate,
    status: event.status,
  })) bucket = 'active'

  // Check if voter can view results
  const canViewResults = canVoterViewElectionResults(event)

  return enrichEventWithParticipantType({
    id: event.id,
    title: event.title,
    description: event.description,
    banner: event.banner ?? null,
    startDate: event.startDate ?? null,
    endDate: event.endDate ?? null,
    organization: event.organization ?? null,
    organizationName: extractOrganizationName(event.organization),
    eventType: 'election',
    bucket,
    participantType: PARTICIPANT_TYPES.ELECTION_VOTER,
    statusLabel: bucket === 'completed' ? 'Voted' : bucket === 'active' ? 'Voting open' : 'Waiting to open',
    actionPath: `/participant/events/${event.id}`,
    actionLabel:
      bucket === 'active' ? 'Cast vote' : bucket === 'completed' ? 'View ballot' : 'View event',
    votingEnabled: Boolean(event.votingEnabled),
    hasVoted: Boolean(event.hasVoted),
    submittedSections: event.submittedSections ?? (event.hasVoted ? 1 : 0),
    totalSections: event.totalSections ?? 1,
    eventStatus: event.status,
    resultsVisibility: event.resultsVisibility ?? 'public',
    canViewResults,
  }, 'election')
}

function classifyCompetition(event) {
  if(Array.isArray(event.nativeContexts)){
    if(!event.nativeContexts.length)return []
    const contexts=event.nativeContexts
    const active=contexts.find(context=>context.state==='open'||context.reviewer)
    const allSubmitted=contexts.every(context=>context.state==='submitted')
    const allClosed=contexts.every(context=>context.state==='closed')
    const bucket=active?'active':allSubmitted?'completed':'assigned'
    const statusLabel=active?.reviewer?'Independent review':active?'Scoring open':contexts.some(context=>context.state==='paused')?'Scoring paused':allSubmitted?'Round submitted':allClosed?'Scoring closed':'Waiting to open'
    const target=active??contexts[0]
    const query=new URLSearchParams({competitionId:target.competitionId,...(target.roundId?{roundId:target.roundId}:{})})
    const contextStatus={waiting:'Waiting to open',open:'Scoring open',paused:'Scoring paused',submitted:'Round submitted',closed:'Scoring closed',review:'Independent review'}
    return enrichEventWithParticipantType({
      id:event.id,
      dashboardKey:`${event.id}:native`,
      title:event.title,
      description:event.description,
      banner:event.banner??null,
      startDate:event.startDate??null,
      endDate:event.endDate??null,
      organization:event.organization??null,
      organizationName:extractOrganizationName(event.organization),
      eventType:'competition_scoring',
      participantType:PARTICIPANT_TYPES.COMPETITION_JUDGE,
      bucket,
      statusLabel,
      actionPath:`/participant/competition/events/${event.id}/score?${query}`,
      actionLabel:active?.reviewer?'Review results':active?'Open scoresheet':'Open competition workspace',
      scoringEnabled:active?.scoringAvailable===true,
      hasScored:contexts.some(context=>context.state==='submitted'),
      eventStatus:event.status,
      nativeContexts:contexts.map(context=>({...context,statusLabel:contextStatus[context.state]??'Waiting to open'})),
    },'competition_scoring')
  }
  let bucket = 'assigned'
  if (event.workflow) {
    if (event.workflow.roundSubmitted) bucket = 'completed'
    else if (event.workflow.sessionStatus === 'active' || event.workflow.submissionWindow === true || event.workflow.reviewer && event.status !== 'draft') bucket = 'active'
  } else if (event.hasScored) bucket = 'completed'
  else if (isCompetitionScoringOpen({
    scoring_enabled: event.scoringEnabled,
    start_date: event.startDate,
    end_date: event.endDate,
    status: event.status,
  })) bucket = 'active'

  return enrichEventWithParticipantType({
    id: event.id,
    title: event.title,
    description: event.description,
    banner: event.banner ?? null,
    startDate: event.startDate ?? null,
    endDate: event.endDate ?? null,
    organization: event.organization ?? null,
    organizationName: extractOrganizationName(event.organization),
    eventType: 'competition_scoring',
    bucket,
    participantType: PARTICIPANT_TYPES.COMPETITION_JUDGE,
    statusLabel: event.workflow?.reviewer ? 'Review competition' : bucket === 'completed' ? 'Round submitted' : bucket === 'active' ? event.workflow?.sessionStatus === 'completed' ? 'Submission window open' : 'Scoring open' : 'Waiting to open',
    actionPath: `/participant/competition/events/${event.id}/score`,
    actionLabel:
      event.workflow?.reviewer ? 'Review results' : bucket === 'active' ? 'Open scoresheet' : bucket === 'completed' ? 'View scores' : 'View event',
    scoringEnabled: Boolean(event.scoringEnabled),
    hasScored: Boolean(event.hasScored),
    eventStatus: event.status,
  }, 'competition_scoring')
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

  return enrichEventWithParticipantType({
    id: event.id,
    title: event.title,
    description: event.description,
    banner: event.banner ?? null,
    startDate: event.startDate ?? null,
    endDate: event.endDate ?? null,
    organization: event.organization ?? null,
    organizationName: extractOrganizationName(event.organization),
    eventType: 'polling',
    bucket,
    participantType: PARTICIPANT_TYPES.POLLING_RESPONDENT,
    statusLabel,
    actionPath: `/participant/polling/events/${event.id}`,
    actionLabel:
      bucket === 'active'
        ? event.hasResponded
          ? 'Submit again'
          : 'Take poll'
        : bucket === 'completed'
          ? 'View responses'
          : 'View poll',
    pollingEnabled: Boolean(event.pollingEnabled),
    pollAllowMultipleSubmissions: Boolean(event.pollAllowMultipleSubmissions),
    hasResponded: Boolean(event.hasResponded),
    pollOpen: open,
  }, 'polling')
}

export async function getVoterDashboard(voterId) {
  const [elections, competitions, polls] = await Promise.all([
    listVoterElectionEvents(voterId),
    listJudgeCompetitionEvents(voterId),
    listVoterPollEvents(voterId),
  ])

  // Fetch results for elections where voter can view them
  const electionResults = {}
  for (const election of elections) {
    if (canVoterViewElectionResults(election)) {
      try {
        const results = await getVoterElectionResults(election.id, voterId)
        electionResults[election.id] = results
      } catch (err) {
        // Ignore errors - results might not be available
        console.error(`Failed to fetch results for election ${election.id}:`, err.message)
      }
    }
  }

  const events = [
    ...elections.map((e) => ({
      ...classifyElection(e),
      results: electionResults[e.id] || null,
    })),
    ...competitions.map(classifyCompetition).flat(),
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
export async function getCompetitionDashboard(voterId){return (await listJudgeCompetitionEvents(voterId)).map(classifyCompetition).flat()}

/**
 * Get the redirect path for a voter after login.
 *
 * Only an ACTIVE event auto-opens its event page (election ballot, poll, or
 * judge scoring). An event is "active" per its own scheduler: elections/polls
 * by their voting/polling window, competitions by a live scoring session (see
 * classifyCompetition — its bucket follows scoring_enabled, which the schedule
 * sync keeps aligned to the session). Assigned-but-not-open events are NOT
 * auto-opened; returning null lands the voter on their dashboard (callers fall
 * back to '/voter'). The participant information form is a modal gate on each
 * event page, so routing to an active event naturally shows it, then keeps the
 * voter on the event page once it's filled.
 */
export async function getVoterLoginRedirect(voterId) {
  const dashboard = await getVoterDashboard(voterId)

  if (dashboard.active.length > 0) {
    const event = dashboard.active[0]
    return {
      path: event.actionPath,
      type: event.eventType,
      title: event.title,
    }
  }

  // No active event → send the voter to their dashboard.
  return null
}
