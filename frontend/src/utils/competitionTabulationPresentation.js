// Presentation only: all totals, contributions, ranks and averages come from
// the current server calculation. These helpers never calculate standings.
export function tabulationMethodName(method, config = {}) {
  return ({
    weighted_average: config.criterionBasis === 'points' ? 'Average Judge Total (points)' : 'Weighted Average Score',
    sum: 'Total Score',
    rank_based: 'Rank-Based Placement',
    manual: 'Manual Official Results',
    highest_score: 'Highest Judge Score (existing method)',
    lowest_removal: 'Remove Extreme Scores (existing method)',
    undecided: 'Not configured',
  })[method] ?? 'Not configured'
}

export function tabulationRanges(criteria, config = {}) {
  return [...new Set(criteria.flatMap(criterion => {
    const targets = config.criterionBasis !== 'points' && criterion.minorCriteria?.length
      ? criterion.minorCriteria : [criterion]
    return targets.map(target => `${target.minScore ?? config.defaultMinScore ?? '—'}–${target.maxScore ?? config.defaultMaxScore ?? '—'}`)
  }))].join(', ') || 'Not configured'
}

export function tabulationNumber(value, precision = 2) {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? numeric.toFixed(Number.isInteger(precision) && precision >= 0 && precision <= 6 ? precision : 2)
    : '—'
}

export function tabulationReportRecords(headers, rows) {
  return rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
}
