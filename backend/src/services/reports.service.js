import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import {
  DB_TABLES,
  EVENT_TYPES,
  COMPETITION_SCORING_EVENT_TYPES,
} from '../utils/constants.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { listElectionEvents, getElectionAnalytics, listPositions } from './election.service.js'
import { listCompetitionEvents, getLiveRankings } from './pageant.service.js'
import { listPollEvents, getPollAnalytics } from './polling.service.js'


function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 10000) / 100 : 0
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value)
  return `"${raw.replace(/"/g, '""')}"`
}

function rowsToCsv(rows) {
  if (!rows?.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','))
  }
  return lines.join('\n')
}

export async function getReportsOverview(organizerId) {
  const [elections, competitions, polls] = await Promise.all([
    listElectionEvents(organizerId),
    listCompetitionEvents(organizerId),
    listPollEvents(organizerId),
  ])

  const electionIds = elections.map((e) => e.id)
  const competitionIds = competitions.map((e) => e.id)
  const pollIds = polls.map((e) => e.id)

  const [electionStats, competitionStats, pollStats] = await Promise.all([
    loadElectionStats(electionIds),
    loadCompetitionStats(competitionIds),
    loadPollStats(pollIds),
  ])

  return {
    generatedAt: new Date().toISOString(),
    elections: elections.map((e) => ({
      ...e,
      reportPath: `/organizer/reports/election/${e.id}`,
      stats: electionStats[e.id] ?? null,
    })),
    competitions: competitions.map((e) => ({
      ...e,
      reportPath: `/organizer/reports/competition/${e.id}`,
      stats: competitionStats[e.id] ?? null,
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

  const [totalRes, votedRes] = await Promise.all([
    getClient().from(DB_TABLES.EVENT_VOTERS).select('event_id', { count: 'exact' }).in('event_id', eventIds),
    getClient().from(DB_TABLES.EVENT_VOTERS).select('event_id', { count: 'exact' }).in('event_id', eventIds).eq('has_voted', true),
  ])

  const totalByEvent = {}
  for (const row of totalRes.data ?? []) {
    totalByEvent[row.event_id] = (totalByEvent[row.event_id] ?? 0) + 1
  }
  const votedByEvent = {}
  for (const row of votedRes.data ?? []) {
    votedByEvent[row.event_id] = (votedByEvent[row.event_id] ?? 0) + 1
  }

  for (const eventId of eventIds) {
    const total = totalByEvent[eventId] ?? 0
    const voted = votedByEvent[eventId] ?? 0
    map[eventId] = { totalVoters: total, votedCount: voted, turnoutPercentage: pct(voted, total) }
  }
  return map
}

async function loadCompetitionStats(eventIds) {
  const map = {}
  if (!eventIds.length) return map

  const [totalRes, submittedRes] = await Promise.all([
    getClient().from(DB_TABLES.EVENT_VOTERS).select('event_id', { count: 'exact' }).in('event_id', eventIds).eq('is_judge', true),
    getClient().from(DB_TABLES.EVENT_VOTERS).select('event_id', { count: 'exact' }).in('event_id', eventIds).eq('is_judge', true).eq('has_scored', true),
  ])

  const totalByEvent = {}
  for (const row of totalRes.data ?? []) {
    totalByEvent[row.event_id] = (totalByEvent[row.event_id] ?? 0) + 1
  }
  const submittedByEvent = {}
  for (const row of submittedRes.data ?? []) {
    submittedByEvent[row.event_id] = (submittedByEvent[row.event_id] ?? 0) + 1
  }

  for (const eventId of eventIds) {
    const total = totalByEvent[eventId] ?? 0
    const submitted = submittedByEvent[eventId] ?? 0
    map[eventId] = { totalJudges: total, submittedCount: submitted, turnoutPercentage: pct(submitted, total) }
  }
  return map
}

async function loadPollStats(eventIds) {
  const map = {}
  if (!eventIds.length) return map

  const [submissionsRes, respondentsRes] = await Promise.all([
    getClient().from(DB_TABLES.POLL_SUBMISSIONS).select('event_id', { count: 'exact' }).in('event_id', eventIds),
    getClient().from(DB_TABLES.EVENT_VOTERS).select('event_id', { count: 'exact' }).in('event_id', eventIds),
  ])

  const submissionsByEvent = {}
  for (const row of submissionsRes.data ?? []) {
    submissionsByEvent[row.event_id] = (submissionsByEvent[row.event_id] ?? 0) + 1
  }
  const respondentsByEvent = {}
  for (const row of respondentsRes.data ?? []) {
    respondentsByEvent[row.event_id] = (respondentsByEvent[row.event_id] ?? 0) + 1
  }

  for (const eventId of eventIds) {
    const count = submissionsByEvent[eventId] ?? 0
    const respondents = respondentsByEvent[eventId] ?? 0
    map[eventId] = { totalSubmissions: count, totalRespondents: respondents, responseRate: pct(count, respondents) }
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
  return getCompetitionReport(eventId, organizerId)
}

export async function getCompetitionReport(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (!COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
    throw new ApiError(400, 'Not a competition scoring event')
  }

  const rankingsData = await getLiveRankings(eventId, organizerId)

  return {
    generatedAt: new Date().toISOString(),
    reportType: 'competition_scoring',
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

export async function getReportsOverviewExport(organizerId) {
  const report = await getReportsOverview(organizerId)
  const rows = [
    ...report.elections.map((item) => ({
      type: 'election',
      title: item.title,
      status: item.status,
      metric: 'turnoutPercentage',
      value: item.stats?.turnoutPercentage ?? 0,
      details: `${item.stats?.votedCount ?? 0}/${item.stats?.totalVoters ?? 0}`,
    })),
    ...report.competitions.map((item) => ({
      type: 'competition_scoring',
      title: item.title,
      status: item.status,
      metric: 'turnoutPercentage',
      value: item.stats?.turnoutPercentage ?? 0,
      details: `${item.stats?.submittedCount ?? 0}/${item.stats?.totalJudges ?? 0}`,
    })),
    ...report.polls.map((item) => ({
      type: 'polling',
      title: item.title,
      status: item.status,
      metric: 'responseRate',
      value: item.stats?.responseRate ?? 0,
      details: `${item.stats?.totalSubmissions ?? 0}/${item.stats?.totalRespondents ?? 0}`,
    })),
  ]

  return {
    filename: `reports-overview-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: rowsToCsv(rows),
    json: report,
  }
}

export async function getElectionReportExport(eventId, organizerId) {
  const report = await getElectionReport(eventId, organizerId)
  const rows = (report.voteSummary?.candidateResults ?? []).map((candidate) => ({
    position: candidate.positionName ?? candidate.positionId ?? '',
    candidate: candidate.candidateName ?? '',
    votes: candidate.votes ?? 0,
    votePercentage: candidate.votePercentage ?? 0,
    shareOfTotalBallots: candidate.shareOfTotalBallots ?? 0,
  }))

  return {
    filename: `election-report-${eventId}.csv`,
    csv: rowsToCsv(rows),
    json: report,
  }
}

export async function getPageantReportExport(eventId, organizerId) {
  return getCompetitionReportExport(eventId, organizerId)
}

export async function getCompetitionReportExport(eventId, organizerId) {
  const report = await getCompetitionReport(eventId, organizerId)
  const rows = (report.rankings ?? []).map((row) => ({
    contestant: row.contestantName ?? row.name ?? '',
    totalScore: row.totalScore ?? 0,
    rank: row.rank ?? '',
  }))

  return {
    filename: `competition-report-${eventId}.csv`,
    csv: rowsToCsv(rows),
    json: report,
  }
}

export async function getPollingReportExport(eventId, organizerId) {
  const report = await getPollingReport(eventId, organizerId)
  const rows = (report.questions ?? []).map((question) => ({
    question: question.question ?? question.title ?? '',
    type: question.type ?? '',
    submissions: question.submissions ?? question.responses ?? 0,
  }))

  return {
    filename: `polling-report-${eventId}.csv`,
    csv: rowsToCsv(rows),
    json: report,
  }
}
