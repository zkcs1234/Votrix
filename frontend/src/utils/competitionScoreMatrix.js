// A readable results sheet for one competition round: one row per entry, one
// column per judge (that judge's total), then the aggregate, any deductions, the
// final score and the rank. The long, audit-style "Combined Scores" export stays
// as it is; this is the version an organizer can print or paste into a report.

function uniqueLabels(labels) {
  const seen = new Map()
  return labels.map((label) => {
    const count = (seen.get(label) ?? 0) + 1
    seen.set(label, count)
    return count === 1 ? label : `${label} (${count})`
  })
}

const rankValue = (rank) => (Number.isFinite(Number(rank)) && rank !== '' && rank !== null ? Number(rank) : Infinity)

export function buildScoreMatrix(sources, context) {
  const calculation = sources?.calculation
  const results = calculation?.output_snapshot?.results
  if (!sources?.complete || !sources.rules?.configuration_snapshot) {
    throw new Error('Complete current judge sheets are required for this export.')
  }
  if (!Array.isArray(results) || !results.length) {
    throw new Error('Calculate the results for this round before exporting the score matrix.')
  }
  const roundId = context.roundId ?? null
  const configuration = sources.rules.configuration_snapshot
  const method =
    configuration.rounds?.find((round) => round.id === roundId)?.calculationMethod ??
    configuration.scoringConfig?.calculationMethod
  const judges = (sources.progress ?? []).filter((judge) => judge.submitted)
  const worksheets = calculation.output_snapshot.worksheets ?? []
  const byEntry = new Map(results.map((result) => [result.contestantId, result]))
  const showDivision = Boolean(calculation.output_snapshot.divisionRanking ?? sources.divisionRanking)
  const showDeductions = results.some((result) => Number(result.deductionTotal) > 0)
  const finalized = calculation.finalized === true
  const status = finalized ? 'Official' : 'Calculated, not finalized'

  const entries = (sources.session?.entry_ids ?? [])
    .map((id) => ({ id, entry: sources.entries?.find((item) => item.id === id), result: byEntry.get(id) }))
    .filter((item) => item.result)
    .sort(
      (a, b) =>
        rankValue(a.result.rank) - rankValue(b.result.rank) ||
        Number(a.entry?.contestantNumber ?? 0) - Number(b.entry?.contestantNumber ?? 0),
    )

  const judgeLabels = uniqueLabels(judges.map((judge, index) => judge.judgeName ?? `Judge ${index + 1}`))
  const headers = [
    'Rank',
    'No.',
    'Entry',
    ...(showDivision ? ['Division'] : []),
    ...judgeLabels,
    method === 'rank_based' ? 'Placement total' : 'Aggregate score',
    ...(showDeductions ? ['Deductions'] : []),
    'Final score',
    'Status',
  ]

  const rows = entries.map(({ id, entry, result }) => [
    result.rank ?? '',
    entry?.contestantNumber ?? '',
    entry?.name ?? 'Entry',
    ...(showDivision ? [result.divisionName ?? entry?.divisionName ?? ''] : []),
    ...judges.map((judge) => {
      const sheet = worksheets.find(
        (item) => item.entryId === id && item.judgeId === judge.judgeId && (item.roundId ?? null) === roundId,
      )
      return sheet?.total ?? ''
    }),
    result.baseScore ?? '',
    ...(showDeductions ? [result.deductionTotal ?? 0] : []),
    result.finalScore ?? '',
    status,
  ])

  const records = rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
  return { headers, rows, records, status, finalized }
}
