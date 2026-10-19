import ScoringMethodExample from './ScoringMethodExample'

const sampleReadiness = { panels: { minimum: 3, total: 3 } }
const examples = {
  weighted_average: ['Average Score', '(90 + 86 + 92) ÷ 3 = 89.33', 'VOTRIX averages the completed weighted judge totals. Higher average scores rank first.'],
  sum: ['Total Score', '90 + 86 + 92 = 268', 'VOTRIX adds the completed weighted judge totals. Higher totals rank first.'],
  rank_based: ['Rank-Based Placement', 'Weighted totals → judge placements → 1 + 2 + 1 = 4', 'Compute weighted scores first, rank contestants separately for each judge, then add placements. Lower aggregate placements rank first.'],
  highest_score: ['Highest judge score', 'max(90, 86, 92) = 92', 'Use the highest submitted weighted judge total.'],
  lowest_removal: ['Remove extreme scores', 'With one high and one low removed: 86, 90, 92 → 90', 'Average the remaining judge totals. Configure removal counts and retain at least one judge.'],
  manual: ['Manual Official Results', 'Judge totals: 90, 86, 92 → organizer records official placements', 'VOTRIX does not generate an automatic numeric result. An authorized user records and verifies the official placements.'],
}
export default function CalculationPreview({ method, config = {} }) {
  const example = examples[method]
  if (!example) return null
  if (method === 'rank_based') {
    return <aside className="rs-rank-card" aria-label="Rank-based placement"><div><h3 className="rs-title">Rank-based placement</h3><p className="v-helper-text mt-1">Fictional example only.</p></div><div className="rs-rank-flow"><div><span className="rs-rank-number">1</span><strong>Weighted Score</strong><p>Calculate each contestant’s weighted score.</p></div><span className="rs-rank-arrow" aria-hidden="true">→</span><div><span className="rs-rank-number">2</span><strong>Judge Ranking</strong><p>Rank contestants for each judge.</p></div><span className="rs-rank-arrow" aria-hidden="true">→</span><div><span className="rs-rank-number">3</span><strong>Final Placement</strong><p>Add the judge placements. The lowest aggregate wins.</p></div></div><p className="rs-rank-note">Weighted scoring happens first: criterion score ÷ maximum × criterion weight. Example: 8 ÷ 10 × 40 = 32 points.</p><ScoringMethodExample config={{...config,calculationMethod:method}} readiness={sampleReadiness} illustrative/></aside>
  }
  return <aside className="rs-rank-card" aria-label="Calculation sample"><h3 className="rs-title">{example[0]}</h3><p className="font-mono text-sm">{example[1]}</p><p className="v-helper-text">{example[2]}</p><ScoringMethodExample config={{...config,calculationMethod:method}} readiness={sampleReadiness} illustrative/></aside>
}
