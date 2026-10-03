export function applyDeductionsToRankings(rankings = [], deductions = [], roundId = null) {
  const totals = new Map()
  for (const deduction of deductions) {
    if (roundId && deduction.roundId && deduction.roundId !== roundId) continue
    totals.set(
      deduction.contestantId,
      (totals.get(deduction.contestantId) ?? 0) + Number(deduction.amount ?? 0),
    )
  }

  const sorted = rankings
    .map((row) => {
      const deductionTotal = totals.get(row.contestantId) ?? 0
      if (row.placementTotal !== undefined) {
        const baseScore = Number(row.placementTotal)
        return { ...row, baseScore, deductionTotal, finalScore: baseScore + deductionTotal }
      }
      const baseScore = Number(row.finalScore ?? row.weightedScore ?? 0)
      return { ...row, baseScore, deductionTotal, finalScore: baseScore - deductionTotal }
    })
    .sort((a, b) => a.placementTotal !== undefined
      ? a.finalScore - b.finalScore
      : b.finalScore - a.finalScore)

  let previousRank = null
  return sorted.map((row, index) => {
    const rank = index > 0 && row.finalScore === sorted[index - 1].finalScore
      ? previousRank
      : index + 1
    previousRank = rank
    return { ...row, rank }
  })
}
