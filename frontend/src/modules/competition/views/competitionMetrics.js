/**
 * Competition Scoring analytics — module-local metric/report adapters.
 *
 * Maps the raw pageant/competition analytics + report payload to the
 * generic shape expected by the shared analytics components. No imports
 * from election or polling modules; no shared event bus.
 */

import { withPercentage, topN, sumBy } from '@/modules/analytics/utils/aggregations'
import { safePercentage } from '@/modules/analytics/utils/format'

export function buildCompetitionStats(analytics) {
  return [
    { id: 'contestants', label: 'Total contestants', value: analytics?.totalContestants ?? 0 },
    { id: 'judges', label: 'Total judges', value: analytics?.totalJudges ?? 0 },
    { id: 'categories', label: 'Total categories', value: analytics?.totalCategories ?? 0 },
    { id: 'rounds', label: 'Total rounds', value: analytics?.totalRounds ?? 0 },
  ]
}

export function buildCompetitionScoreStats(analytics) {
  const submitted = analytics?.submittedScores ?? analytics?.judgeTurnout?.submittedCount ?? 0
  const pending = analytics?.pendingScores ?? analytics?.judgeTurnout?.pendingCount ?? 0
  const completion = safePercentage(submitted, submitted + pending)
  return [
    { id: 'submitted', label: 'Submitted scores', value: submitted, tone: 'success' },
    { id: 'pending', label: 'Pending scores', value: pending, tone: 'warning' },
    { id: 'completion', label: 'Scoring completion', value: `${completion}%`, tone: 'muted' },
  ]
}

export function buildCompetitionOverallRankings(analytics, { limit } = {}) {
  const rows = (analytics?.rankings ?? analytics?.contestantRankings ?? []).map((r, idx) => ({
    id: r.contestantId ?? `${r.contestantName}-${idx}`,
    rank: r.rank ?? idx + 1,
    name: r.contestantName,
    value: Number(r.weightedScore ?? 0),
    sublabel: r.contestantNumber ? `#${r.contestantNumber}` : null,
    photo: r.photo,
    meta: r.criteriaBreakdown
      ? r.criteriaBreakdown
          .map((c) => `${c.criteriaName}: ${c.average} (${c.percentage}%)`)
          .join(' · ')
      : null,
  }))
  return limit ? topN(rows, limit, 'value') : rows
}

export function buildCompetitionCategoryRankings(analytics) {
  return (analytics?.categoryRankings ?? []).map((cat, idx) => {
    const contestants = withPercentage(
      (cat.contestants ?? cat.entries ?? []).map((c) => ({
        id: c.contestantId ?? c.id ?? `${c.name}-${idx}`,
        label: c.contestantName ?? c.name ?? '—',
        value: Number(c.weightedScore ?? c.score ?? 0),
      })),
      'value',
    )
    return {
      id: cat.categoryId ?? cat.id ?? cat.name ?? `cat-${idx}`,
      name: cat.categoryName ?? cat.name ?? 'Category',
      contestants,
    }
  })
}

export function buildCompetitionJudgeActivity(analytics) {
  return (analytics?.judgeActivity ?? analytics?.judges ?? []).map((j, idx) => ({
    id: j.judgeId ?? j.id ?? `${j.name}-${idx}`,
    name: j.judgeName ?? j.name ?? '—',
    value: j.submittedCount ?? j.scoresSubmitted ?? 0,
    sublabel: j.email ?? null,
    meta:
      j.totalAssigned !== undefined
        ? `${j.submittedCount ?? 0} / ${j.totalAssigned} assigned`
        : j.status ?? null,
  }))
}

export function buildCompetitionRounds(analytics) {
  return (analytics?.rounds ?? []).map((round, idx) => ({
    id: round.roundId ?? round.id ?? `round-${idx}`,
    name: round.name ?? round.roundName ?? `Round ${idx + 1}`,
    value: Number(round.submittedCount ?? round.scoresSubmitted ?? 0),
    sublabel:
      round.totalScores !== undefined
        ? `${round.submittedCount ?? 0} / ${round.totalScores} scores`
        : null,
  }))
}

export function buildCompetitionReportSheets(report) {
  const rankings = report?.rankings ?? []
  return [
    {
      name: 'Summary',
      rows: [
        {
          event: report?.event?.title ?? '',
          totalJudges: report?.judgeTurnout?.totalJudges ?? 0,
          submitted: report?.judgeTurnout?.submittedCount ?? 0,
          pending: report?.judgeTurnout?.pendingCount ?? 0,
          turnout: `${report?.judgeTurnout?.turnoutPercentage ?? 0}%`,
        },
      ],
    },
    {
      name: 'Rankings',
      rows: rankings.map((r) => ({
        rank: r.rank,
        contestantNumber: r.contestantNumber,
        contestantName: r.contestantName,
        weightedScore: r.weightedScore,
      })),
    },
    {
      name: 'Criteria Breakdown',
      rows: rankings.flatMap((r) =>
        (r.criteriaBreakdown ?? []).map((c) => ({
          rank: r.rank,
          contestant: r.contestantName,
          criteria: c.criteriaName,
          average: c.average,
          percentage: c.percentage,
        })),
      ),
    },
  ]
}

export function buildCompetitionReportCsvRows(report) {
  return (report?.rankings ?? []).map((r) => ({
    rank: r.rank,
    contestantNumber: r.contestantNumber,
    contestantName: r.contestantName,
    weightedScore: r.weightedScore,
  }))
}

export function buildCompetitionExportPayload(report, { generatedAt } = {}) {
  const turnout = report?.judgeTurnout ?? {}
  return {
    title: report?.event?.title ?? 'Competition report',
    subtitle: 'Competition Scoring report — rankings & judge turnout',
    generatedAt: generatedAt ?? new Date().toISOString(),
    sections: [
      {
        title: 'Judge scoring turnout',
        kind: 'stats',
        stats: [
          { label: 'Total judges', value: turnout.totalJudges ?? 0 },
          { label: 'Submitted', value: turnout.submittedCount ?? 0 },
          { label: 'Pending', value: turnout.pendingCount ?? 0 },
          { label: 'Turnout', value: `${turnout.turnoutPercentage ?? 0}%` },
        ],
      },
      {
        title: 'Rankings',
        kind: 'table',
        columns: [
          { key: 'rank', label: 'Rank' },
          { key: 'contestant', label: 'Contestant' },
          { key: 'score', label: 'Weighted score' },
        ],
        rows: (report?.rankings ?? []).map((r) => ({
          rank: r.rank,
          contestant: `#${r.contestantNumber ?? ''} ${r.contestantName ?? ''}`.trim(),
          score: Number(r.weightedScore ?? 0).toFixed(2),
        })),
      },
      {
        title: 'Criteria breakdown',
        kind: 'table',
        columns: [
          { key: 'rank', label: 'Rank' },
          { key: 'contestant', label: 'Contestant' },
          { key: 'criteria', label: 'Criteria' },
          { key: 'average', label: 'Average' },
          { key: 'percentage', label: '%' },
        ],
        rows: (report?.rankings ?? []).flatMap((r) =>
          (r.criteriaBreakdown ?? []).map((c) => ({
            rank: r.rank,
            contestant: r.contestantName,
            criteria: c.criteriaName,
            average: c.average,
            percentage: c.percentage !== undefined ? `${c.percentage}%` : '',
          })),
        ),
      },
    ],
  }
}

export function buildCompetitionContestantPerformance(report) {
  return (report?.rankings ?? []).map((r) => ({
    id: r.contestantId,
    rank: r.rank,
    name: `#${r.contestantNumber} ${r.contestantName}`,
    sublabel: `Weighted ${Number(r.weightedScore ?? 0).toFixed(2)}`,
    value: Number(r.weightedScore ?? 0),
    photo: r.photo,
    meta: (r.criteriaBreakdown ?? [])
      .map((c) => `${c.criteriaName}: ${c.average} (${c.percentage}%)`)
      .join(' · '),
  }))
}

export function buildCompetitionRoundResults(report) {
  return (report?.roundResults ?? []).map((round, idx) => ({
    id: round.roundId ?? `round-${idx}`,
    name: round.name ?? `Round ${idx + 1}`,
    value: Number(round.submittedCount ?? 0),
    sublabel:
      round.totalScores !== undefined
        ? `${round.submittedCount ?? 0} / ${round.totalScores} scores`
        : null,
  }))
}

export function buildCompetitionCategoryResults(report) {
  return (report?.categoryResults ?? []).map((cat, idx) => {
    const contestants = withPercentage(
      (cat.entries ?? cat.contestants ?? []).map((c) => ({
        id: c.contestantId ?? c.id ?? `${c.name}-${idx}`,
        label: c.contestantName ?? c.name ?? '—',
        value: Number(c.weightedScore ?? c.score ?? 0),
      })),
      'value',
    )
    return {
      id: cat.categoryId ?? cat.id ?? cat.name ?? `cat-${idx}`,
      name: cat.categoryName ?? cat.name ?? 'Category',
      contestants,
    }
  })
}

// Convenience: derive category results from the live analytics payload
// (used by the analytics page which only has the lighter shape).
export function sumScore(rows) {
  return sumBy(rows ?? [], 'value')
}
