/**
 * Election analytics — module-local metric/report adapters.
 *
 * These functions take the raw election analytics/report payload (from
 * the election service) and shape it into the generic shape expected by
 * the shared analytics components.
 *
 * No imports from competition/polling modules. No shared event bus.
 */

import { withPercentage, sumBy, topN } from '@/modules/analytics/utils/aggregations'
import { safePercentage } from '@/modules/analytics/utils/format'

const VISIBILITY_LABEL = {
  real_time: 'Real-time results',
  hidden: 'Hidden results',
  public: 'Public results',
}

export function electionVisibilityLabel(value) {
  return VISIBILITY_LABEL[value] ?? value
}

export function buildElectionStats(analytics) {
  return [
    { id: 'voters', label: 'Total registered voters', value: analytics?.totalVoters ?? 0 },
    { id: 'voted', label: 'Votes cast', value: analytics?.votedCount ?? 0 },
    {
      id: 'turnout',
      label: 'Turnout percentage',
      value: `${analytics?.turnoutPercentage ?? 0}%`,
      tone: 'success',
    },
    { id: 'live', label: 'Total ballot selections', value: analytics?.liveTotalVotes ?? 0 },
  ]
}

export function buildElectionCandidateRanking(analytics, { limit } = {}) {
  const rows = (analytics?.candidateResults ?? []).map((c, idx) => ({
    id: c.candidateId ?? `${c.candidateName}-${idx}`,
    rank: idx + 1,
    name: c.candidateName,
    value: c.votes ?? 0,
    sublabel: c.positionName,
    meta: c.votePercentage !== undefined ? `${c.votePercentage}% of position` : null,
  }))
  return limit ? topN(rows, limit, 'value').map((r, i) => ({ ...r, rank: i + 1 })) : rows
}

export function buildElectionPositionSummaries(analytics) {
  return (analytics?.positionSummaries ?? []).map((position) => {
    const candidates = withPercentage(
      (position.candidates ?? []).map((c) => ({
        id: c.candidateId,
        label: c.candidateName,
        value: c.votes ?? 0,
      })),
      'value',
    )
    const totalVotes = sumBy(candidates, 'value')
    const leader = [...candidates].sort((a, b) => b.value - a.value)[0]
    return {
      id: position.positionId,
      name: position.positionName,
      totalVotes,
      leader: leader
        ? {
            id: leader.id,
            name: leader.label,
            votes: leader.value,
            percentage: leader.percentage,
          }
        : null,
      candidates,
    }
  })
}

export function buildElectionVotingProgress(analytics) {
  const voted = Number(analytics?.votedCount ?? 0)
  const total = Number(analytics?.totalVoters ?? 0)
  const items = [
    { id: 'voted', label: 'Voted', value: voted },
    { id: 'not-voted', label: 'Not voted', value: Math.max(total - voted, 0) },
    { id: 'total', label: 'Total registered', value: total },
  ]
  return items
}

export function buildElectionParticipationTrend(analytics) {
  // The election analytics payload exposes aggregate counts only. The
  // "trend" shown here is the live participation snapshot — modules are
  // free to enrich this when the backend exposes per-day series.
  return buildElectionVotingProgress(analytics)
}

export function buildElectionExportPayload(report, { generatedAt } = {}) {
  const turnout = report?.turnout ?? {}
  const voteSummary = report?.voteSummary ?? {}
  return {
    title: report?.event?.title ?? 'Election report',
    subtitle: 'Election report — turnout & vote summary',
    generatedAt: generatedAt ?? new Date().toISOString(),
    sections: [
      {
        title: 'Voter turnout',
        kind: 'stats',
        stats: [
          { label: 'Total voters', value: turnout.totalVoters ?? 0 },
          { label: 'Voted', value: turnout.votedCount ?? 0 },
          { label: 'Not voted', value: turnout.notVotedCount ?? 0 },
          {
            label: 'Turnout',
            value: `${turnout.turnoutPercentage ?? 0}%`,
          },
        ],
      },
      {
        title: 'Vote summary',
        kind: 'stats',
        stats: [
          { label: 'Total ballot selections', value: voteSummary.liveTotalVotes ?? 0 },
          { label: 'Positions', value: voteSummary.positionSummaries?.length ?? 0 },
        ],
      },
      {
        title: 'Candidate results',
        kind: 'table',
        columns: [
          { key: 'candidate', label: 'Candidate' },
          { key: 'position', label: 'Position' },
          { key: 'votes', label: 'Votes' },
          { key: 'votePercentage', label: '%' },
        ],
        rows: (voteSummary.candidateResults ?? []).map((c) => ({
          candidate: c.candidateName,
          position: c.positionName ?? '',
          votes: c.votes ?? 0,
          votePercentage: c.votePercentage !== undefined ? `${c.votePercentage}%` : '',
        })),
      },
      ...(voteSummary.positionSummaries ?? []).map((position) => ({
        title: `Position: ${position.positionName}`,
        kind: 'table',
        columns: [
          { key: 'candidate', label: 'Candidate' },
          { key: 'votes', label: 'Votes' },
          { key: 'votePercentage', label: '%' },
        ],
        rows: (position.candidates ?? []).map((c) => ({
          candidate: c.candidateName,
          votes: c.votes ?? 0,
          votePercentage:
            c.votePercentage !== undefined ? `${c.votePercentage}%` : '',
        })),
      })),
    ],
  }
}

export function buildElectionReportSheets(report) {
  const turnout = report?.turnout ?? {}
  const voteSummary = report?.voteSummary ?? {}
  return [
    {
      name: 'Summary',
      rows: [
        {
          event: report?.event?.title ?? '',
          totalVoters: turnout.totalVoters ?? 0,
          votedCount: turnout.votedCount ?? 0,
          notVotedCount: turnout.notVotedCount ?? 0,
          turnoutPercentage: `${turnout.turnoutPercentage ?? 0}%`,
          totalBallotSelections: voteSummary.liveTotalVotes ?? 0,
        },
      ],
    },
    {
      name: 'Candidates',
      rows: (voteSummary.candidateResults ?? []).map((c) => ({
        position: c.positionName ?? '',
        candidate: c.candidateName,
        votes: c.votes ?? 0,
        votePercentage: c.votePercentage !== undefined ? `${c.votePercentage}%` : '',
      })),
    },
    ...(voteSummary.positionSummaries ?? []).map((position) => ({
      name: position.positionName?.slice(0, 28) || 'Position',
      rows: (position.candidates ?? []).map((c) => ({
        candidate: c.candidateName,
        votes: c.votes ?? 0,
        votePercentage: c.votePercentage !== undefined ? `${c.votePercentage}%` : '',
      })),
    })),
  ]
}

export function buildElectionReportCsvRows(report) {
  const rows = []
  for (const pos of report?.voteSummary?.positionSummaries ?? []) {
    for (const c of pos.candidates ?? []) {
      rows.push({
        position: pos.positionName,
        candidate: c.candidateName,
        votes: c.votes,
        votePercentage: c.votePercentage,
      })
    }
  }
  return rows
}

/**
 * Audit Activity Report — the backend exposes a separate audit logs
 * endpoint, but for the in-report "Audit Activity" view we surface
 * a compact summary derived from the analytics payload (events touched,
 * total voters, votes recorded). The full audit trail lives in the
 * admin Audit Logs page; this card keeps the report self-contained.
 */
export function buildElectionAuditActivity(analytics) {
  return [
    { key: 'Voters registered', value: analytics?.totalVoters ?? 0 },
    { key: 'Votes recorded', value: analytics?.liveTotalVotes ?? 0 },
    { key: 'Positions tracked', value: analytics?.positionSummaries?.length ?? 0 },
    {
      key: 'Completion',
      value: `${safePercentage(analytics?.votedCount ?? 0, analytics?.totalVoters ?? 0)}%`,
    },
  ]
}
