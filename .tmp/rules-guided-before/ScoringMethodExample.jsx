import { useMemo } from 'react'
import { calculateOfficial } from '../../../../../shared/competition-calculation.js'
import { SCORING_METHODS } from '../../../../../shared/competition-rule-configuration.js'

// Educational fixtures only. Every numeric result and placement comes from the
// existing official engine; these objects never enter an API or score store.
export default function ScoringMethodExample({ config, readiness }) {
  const method = config.calculationMethod
  const example = useMemo(() => {
    if (!SCORING_METHODS.some(m => m.id === method) || method === 'manual') return null
    const drops = Number(config.dropHighest ?? 0) + Number(config.dropLowest ?? 0)
    if (method === 'lowest_removal' && (!readiness.panels.total || !Number.isInteger(drops) || drops < 0 || drops >= readiness.panels.minimum)) return { pending: true }
    const count = method === 'lowest_removal' ? Math.min(readiness.panels.minimum, Math.max(3, drops + 1)) : 3
    const names = method === 'rank_based' ? ['John', 'Mark', 'Paul'] : ['John']
    const judges = Array.from({ length: count }, (_, i) => ({ judgeId: `example-judge-${i + 1}`, role: 'judge', isActive: true }))
    const rules = { id: 'educational-example', event: { id: 'educational-example' },
      scoringConfig: { ...config, decimalPlaces: Number(config.decimalPlaces), deductionRules: [], perDivision: false },
      rounds: [], categories: [], contestants: names.map(name => ({ id: name, name })),
      criteria: [{ id: 'example-quality', name: 'Weighted total', percentage: 100, minorCriteria: [{ id: 'example-total', minScore: 0, maxScore: 100 }] }], judges }
    const numericTotals = Array.from({ length: count }, (_, i) => [90, 86, 92][i % 3])
    const placementTotals = [[90, 70, 80], [80, 90, 70], [70, 80, 90]]
    const submissions = judges.map((judge, i) => ({ id: judge.judgeId, judge_id: judge.judgeId, round_id: null, rules_version: rules.id, status: 'submitted',
      sources: names.map((name, n) => ({ contestantId: name, scores: { 'example-total': method === 'rank_based' ? placementTotals[n][i] : numericTotals[i] } })) }))
    try {
      const result = calculateOfficial(rules, submissions)
      const placements = method === 'rank_based' ? judges.map(judge => calculateOfficial({ ...rules, judges: [judge] }, submissions.filter(s => s.judge_id === judge.judgeId)).results) : null
      return { result, judges, numericTotals, placements, names }
    } catch { return { invalid: true } }
  }, [config, readiness.panels.minimum, readiness.panels.total, method])
  if (method === 'undecided' || !SCORING_METHODS.some(m => m.id === method)) return <p className="text-sm text-v-text-muted">Choose an official scoring method to preview how results will be calculated.</p>
  if (method === 'manual') return <div className="space-y-3"><p className="text-sm text-v-text-muted">An authorized person records documented placements. A different appointed reviewer checks them before final approval. VOTRIX does not calculate a numeric score for this method.</p><div className="overflow-x-auto rounded-lg border border-v-border"><table className="v-table w-full"><thead><tr><th>Contestant</th><th>Sample approved placement</th></tr></thead><tbody>{['John', 'Mark', 'Paul'].map((name, i) => <tr key={name}><td>{name}</td><td>{i + 1}</td></tr>)}</tbody></table></div><p className="text-xs text-v-text-subtle">Manual ties and placement numbers must follow the documented competition procedure.</p></div>
  if (example?.pending) return <p className="text-sm text-v-text-muted">Add scoring judges in the Judges step and choose removal counts that keep at least one total. A valid educational example will then appear.</p>
  if (example?.invalid) return <p className="text-sm text-v-text-muted">Complete the precision and removal settings to see a valid example.</p>
  const label = { weighted_average: 'Average', sum: 'Total', highest_score: 'Highest', lowest_removal: 'Average after removal', rank_based: 'Rank sum' }[method]
  return <div className="space-y-3">
    <div className="overflow-x-auto rounded-lg border border-v-border"><table className="v-table w-full"><caption className="sr-only">Fictional example: {SCORING_METHODS.find(m => m.id === method).name}</caption><thead><tr><th>Contestant</th>{example.judges.map((j, i) => <th key={j.judgeId}>{method === 'rank_based' ? `J${i + 1} rank` : `Judge ${i + 1}`}</th>)}<th>{label}</th></tr></thead><tbody>{example.names.map(name => <tr key={name}><td>{name}</td>{example.judges.map((j, i) => <td key={j.judgeId}>{example.placements ? example.placements[i].find(r => r.contestantId === name).placementTotal : example.numericTotals[i]}</td>)}<td className="font-semibold">{example.result.results.find(r => r.contestantId === name).finalScore}</td></tr>)}</tbody></table></div>
    <p className="text-sm text-v-text-muted">{({ weighted_average: 'VOTRIX averages the submitted weighted judge totals. Higher averages rank first.', sum: 'VOTRIX adds the submitted weighted judge totals. Higher totals rank first.', highest_score: 'The highest submitted weighted judge total determines this result.', lowest_removal: `Remove ${config.dropHighest ?? 0} highest and ${config.dropLowest ?? 0} lowest judge totals, then average the remaining totals.`, rank_based: 'Lower rank sums are better. All three contestants share rank 1 in this example because their sums are equal.' })[method]}</p>
    {method === 'rank_based' && <p className="text-xs text-v-text-subtle">Within one judge’s ranking, equal totals share placements such as 1, 1, 3. Equal combined sums also share ranks.</p>}
    {method === 'lowest_removal' && <p className="text-xs text-v-text-subtle">This fictional example uses {example.judges.length} judges and the configured removal counts. Actual panels are checked before publication.</p>}
  </div>
}
