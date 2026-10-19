export const ROUND_PURPOSES = [
  { value: 'regular', label: 'Score contestants or entries', description: 'Judges evaluate entries without automatic elimination.' },
  { value: 'qualification', label: 'Select qualifiers', description: 'Determine who proceeds to the next round. Configure advancement after creating it.' },
  { value: 'final', label: 'Determine final winners', description: 'Use this round to determine winners and final placements.' },
]
export const ROUND_SCORE_USES = [
  { value: 'back_to_zero', label: 'Count separately', description: 'Results are calculated independently, using this round’s scores.' },
  { value: 'weighted', label: 'Combine with other rounds', description: 'This round contributes a percentage to a combined result.' },
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
export function roundSummary(round) {
  const purpose = { regular: 'Scoring Round', qualification: 'Qualification Round', final: 'Final Round', special: 'Special Award Round' }[round.purpose ?? 'regular']
  const progression = roundProgression(round)
  const usage = round.purpose === 'special' ? 'Independent award scoring' : progression === 'weighted' ? `${Number(round.weight ?? 0)}% contribution to combined results`
    : progression === 'carry_forward' ? 'Includes earlier round scores' : 'Independent scoring'
  return `${purpose} · ${usage}`
}
