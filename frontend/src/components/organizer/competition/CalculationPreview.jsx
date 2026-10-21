const descriptions = {
  weighted_average: 'Weighted Mean: each judge’s criterion-weighted total is averaged to determine the final score. Higher averages rank first.',
  sum: 'Each contestant’s completed judge totals are added together to determine the final score. Higher totals rank first.',
  rank_based: 'Contestants are ranked separately for each judge using their scores. Their placements are then added together, and the lowest placement total ranks first.',
  highest_score: 'Each contestant’s highest completed judge total becomes their final score. Higher scores rank first.',
  lowest_removal: 'The configured highest and lowest judge totals are removed, then the remaining totals are averaged. Higher averages rank first, and at least one judge total must remain.',
  manual: 'An authorized person records the official placements, and an appointed reviewer verifies them. VOTRIX does not calculate a numeric score for this method.',
}

export default function CalculationPreview({ method }) {
  const description = descriptions[method]
  if (!description) return null
  return <p className="rs-method-description" role="note" aria-label="Scoring method explanation">{description}</p>
}
