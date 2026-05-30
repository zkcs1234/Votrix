import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, EVENT_TYPES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { listElectionEvents, getElectionAnalytics, listPositions } from './election.service.js'
import { listPageantEvents, getLiveRankings } from './pageant.service.js'
import { listPollEvents, getPollAnalytics } from './polling.service.js'

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 10000) / 100 : 0
}

export async function getReportsOverview(organizerId) {
  const [elections, pageants, polls] = await Promise.all([
    listElectionEvents(organizerId),
    listPageantEvents(organizerId),
    listPollEvents(organizerId),
  ])

  const electionIds = elections.map((e) => e.id)
  const pageantIds = pageants.map((e) => e.id)
  const pollIds = polls.map((e) => e.id)

  const [electionStats, pageantStats, pollStats] = await Promise.all([
    loadElectionStats(electionIds),
    loadPageantStats(pageantIds),
    loadPollStats(pollIds),
  ])

  return {
    generatedAt: new Date().toISOString(),
    elections: elections.map((e) => ({
      ...e,
      reportPath: `/organizer/reports/election/${e.id}`,
      stats: electionStats[e.id] ?? null,
    })),
    pageants: pageants.map((e) => ({
      ...e,
      reportPath: `/organizer/reports/pageant/${e.id}`,
      stats: pageantStats[e.id] ?? null,
    })),
    polls: polls.map((e) => ({
      ...e,
      reportPath: `/organizer/reports/polling/${e.id}`,
      stats: pollStats[e.id] ?? null,
    })),
  }
}

async function loadElectionStats(eventIds) {
  const map = {}
  if (!eventIds.length) return map

  for (const eventId of eventIds) {
    const { count: total } = await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)

    const { count: voted } = await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('has_voted', true)

    map[eventId] = {
      totalVoters: total ?? 0,
      votedCount: voted ?? 0,
      turnoutPercentage: pct(voted ?? 0, total ?? 0),
    }
  }
  return map
}

async function loadPageantStats(eventIds) {
  const map = {}
  if (!eventIds.length) return map

  for (const eventId of eventIds) {
    const { count: total } = await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('is_judge', true)

    const { count: submitted } = await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('is_judge', true)
      .eq('has_scored', true)

    map[eventId] = {
      totalJudges: total ?? 0,
      submittedCount: submitted ?? 0,
      turnoutPercentage: pct(submitted ?? 0, total ?? 0),
    }
  }
  return map
}

async function loadPollStats(eventIds) {
  const map = {}
  if (!eventIds.length) return map

  for (const eventId of eventIds) {
    const { count } = await getClient()
      .from(DB_TABLES.POLL_SUBMISSIONS)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)

    const { count: respondents } = await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)

    map[eventId] = {
      totalSubmissions: count ?? 0,
      totalRespondents: respondents ?? 0,
      responseRate: pct(count ?? 0, respondents ?? 0),
    }
  }
  return map
}

export async function getElectionReport(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'Not an election event')
  }

  const [analytics, positions] = await Promise.all([
    getElectionAnalytics(eventId, organizerId),
    listPositions(eventId, organizerId),
  ])

  const positionSummaries = positions.map((position) => {
    const candidates = (analytics.candidateResults ?? [])
      .filter((c) => c.positionId === position.id)
      .map((c) => ({ ...c }))

    const totalPositionVotes = candidates.reduce((sum, c) => sum + c.votes, 0)
    candidates.sort((a, b) => b.votes - a.votes)

    const withPct = candidates.map((c) => ({
      ...c,
      votePercentage: pct(c.votes, totalPositionVotes),
      shareOfTotalBallots: pct(c.votes, analytics.liveTotalVotes || 0),
    }))

    const leader = withPct[0] ?? null

    return {
      positionId: position.id,
      positionName: position.name,
      minVote: position.minVote,
      maxVote: position.maxVote,
      totalVotes: totalPositionVotes,
      candidateCount: withPct.length,
      leader: leader
        ? { name: leader.candidateName, votes: leader.votes, votePercentage: leader.votePercentage }
        : null,
      candidates: withPct,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    reportType: 'election',
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      status: event.status,
      votingEnabled: Boolean(event.voting_enabled),
    },
    turnout: {
      totalVoters: analytics.totalVoters,
      votedCount: analytics.votedCount,
      notVotedCount: (analytics.totalVoters ?? 0) - (analytics.votedCount ?? 0),
      turnoutPercentage: analytics.turnoutPercentage,
    },
    voteSummary: {
      liveTotalVotes: analytics.liveTotalVotes,
      candidateResults: analytics.candidateResults,
      positionSummaries,
    },
  }
}

export async function getPageantReport(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (event.event_type !== EVENT_TYPES.PAGEANT) {
    throw new ApiError(400, 'Not a pageant event')
  }

  const rankingsData = await getLiveRankings(eventId, organizerId)

  return {
    generatedAt: new Date().toISOString(),
    reportType: 'pageant',
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      status: event.status,
      scoringEnabled: Boolean(event.scoring_enabled),
    },
    judgeTurnout: {
      totalJudges: rankingsData.judges.total,
      submittedCount: rankingsData.judges.submitted,
      pendingCount: rankingsData.judges.total - rankingsData.judges.submitted,
      turnoutPercentage: pct(rankingsData.judges.submitted, rankingsData.judges.total),
    },
    rankings: rankingsData.rankings,
    criteriaTotalPercentage: rankingsData.criteriaTotalPercentage,
  }
}

export async function getPollingReport(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (event.event_type !== EVENT_TYPES.POLLING) {
    throw new ApiError(400, 'Not a polling event')
  }

  const analytics = await getPollAnalytics(eventId, organizerId)

  const { count: enrolled } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  return {
    generatedAt: new Date().toISOString(),
    reportType: 'polling',
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      pollAnonymous: Boolean(event.poll_anonymous),
      pollingEnabled: Boolean(event.polling_enabled),
    },
    responseSummary: {
      totalSubmissions: analytics.totalSubmissions,
      enrolledRespondents: enrolled ?? 0,
      responseRate: pct(analytics.totalSubmissions, enrolled ?? 0),
      pollAnonymous: analytics.pollAnonymous,
    },
    questions: analytics.questions,
  }
}
