export const ROUND_PURPOSES = [
  { value: 'regular', label: 'Scoring round', description: 'Judges evaluate entries without elimination.' },
  { value: 'qualification', label: 'Qualifying round', description: 'Determine who advances to the next round.' },
  { value: 'final', label: 'Final round', description: 'Determine winners and final placements.' },
]
export const ROUND_SCORE_USES = [
  { value: 'back_to_zero', label: 'Independent result', description: 'This round is scored separately.' },
  { value: 'weighted', label: 'Combined with other rounds', description: 'This round contributes to a combined result.' },
]
export function roundProgression(round) { return round.progression ?? 'weighted' }
export function contributionTotal(rounds, categoryId = null, excludeId = null) {
  return rounds.filter(round => round.id !== excludeId && roundProgression(round) === 'weighted' && round.purpose !== 'special'
    && (round.categoryId ?? null) === (categoryId || null)).reduce((total, round) => total + Number(round.weight ?? 0), 0)
}
export function roundFormValues(round) {
  return { name: round?.name ?? '', description: round?.description ?? '', purpose: round?.purpose ?? 'regular',
    progression: round ? roundProgression(round) : 'back_to_zero', weight: round?.weight ?? '',
    categoryId: round?.categoryId ?? '', divisionId: round?.divisionId ?? '' }
}
export function validateRoundForm(values, rounds, original = null) {
  const errors = {}
  if (!values.name.trim()) errors.name = 'Enter a name for this round.'
  const combined = values.progression === 'weighted' && values.purpose !== 'special'
  const weight = Number(values.weight)
  if (combined) {
    const changed = !original || weight !== Number(original.weight) || values.progression !== roundProgression(original)
      || (values.categoryId || null) !== (original.categoryId ?? null) || values.purpose !== original.purpose
    const remaining = Math.max(0, 100 - contributionTotal(rounds, values.categoryId, original?.id))
    if (!Number.isFinite(weight) || values.weight === '' || weight < 0 || weight > 100 || (changed && weight <= 0)) {
      errors.weight = 'Enter a contribution greater than 0 and no more than 100%.'
    } else if (weight > remaining + 0.001) {
      errors.weight = `Only ${remaining.toFixed(2)}% is available in this combined result. Enter a smaller contribution.`
    }
  }
  const payload = { name: values.name.trim(), purpose: values.purpose, progression: values.progression,
    weight: combined ? weight : original?.weight ?? 0, categoryId: values.categoryId || null, divisionId: values.divisionId || null }
  if (original) {
    payload.description = values.description.trim() || null
    for (const key of Object.keys(payload)) {
      const previous = key === 'progression' ? roundProgression(original)
        : key === 'purpose' ? original.purpose ?? 'regular' : key === 'weight' ? Number(original.weight ?? 0) : original[key] ?? null
      if (payload[key] === previous) delete payload[key]
    }
  }
  return { errors, payload }
}
export function roundPurposeLabel(round) {
  return { regular: 'Scoring', qualification: 'Qualifying', final: 'Final', special: 'Special award' }[round.purpose ?? 'regular'] ?? 'Scoring'
}
export function roundScoreSummary(round) {
  const progression = roundProgression(round)
  return round.purpose === 'special' ? 'Independent award' : progression === 'weighted' ? `Combined · ${Number(round.weight ?? 0)}% contribution`
    : progression === 'carry_forward' ? 'Includes earlier scores' : 'Independent'
}
