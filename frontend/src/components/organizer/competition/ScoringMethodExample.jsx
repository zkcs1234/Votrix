import { useMemo } from 'react'
import { calculateOfficial } from '../../../../../shared/competition-calculation.js'
import { SCORING_METHODS } from '../../../../../shared/competition-rule-configuration.js'

// Educational fixtures only. Every numeric result and placement comes from the
// existing official engine; these objects never enter an API or score store.
export default function ScoringMethodExample({ config, readiness, illustrative = false }) {
  const method = config.calculationMethod
  const example = useMemo(() => {
    if (!SCORING_METHODS.some(m => m.id === method) || method === 'manual') return null
    const sampleConfig = illustrative && method === 'lowest_removal' ? { ...config, dropHighest: 1, dropLowest: 1 } : config
    const drops = Number(sampleConfig.dropHighest ?? 0) + Number(sampleConfig.dropLowest ?? 0)
    if (!illustrative && method === 'lowest_removal' && (!readiness.panels.total || !Number.isInteger(drops) || drops < 0 || drops >= readiness.panels.minimum)) return { pending: true }
    const count = !illustrative && method === 'lowest_removal' ? Math.min(readiness.panels.minimum, Math.max(3, drops + 1)) : 3
    const names = method === 'rank_based' ? ['John', 'Mark', 'Paul'] : ['John']
    const judges = Array.from({ length: count }, (_, i) => ({ judgeId: `example-judge-${i + 1}`, role: 'judge', isActive: true }))
    const rules = { id: 'educational-example', event: { id: 'educational-example' },
      scoringConfig: { ...sampleConfig, decimalPlaces: config.decimalPlaces !== '' && Number.isInteger(Number(config.decimalPlaces)) && config.decimalPlaces >= 0 && config.decimalPlaces <= 6 ? Number(config.decimalPlaces) : 2, deductionRules: [], perDivision: false },
      rounds: [], categories: [], contestants: names.map(name => ({ id: name, name })),
      criteria: [{ id: 'example-quality', name: 'Weighted total', percentage: 100, minorCriteria: [{ id: 'example-total', minScore: 0, maxScore: 100 }] }], judges }
    const numericTotals = Array.from({ length: count }, (_, i) => [90, 86, 92][i % 3])
    const placementTotals = [[90, 80, 90], [80, 90, 80], [70, 70, 70]]
    const submissions = judges.map((judge, i) => ({ id: judge.judgeId, judge_id: judge.judgeId, round_id: null, rules_version: rules.id, status: 'submitted',
      sources: names.map((name, n) => ({ contestantId: name, scores: { 'example-total': method === 'rank_based' ? placementTotals[n][i] : numericTotals[i] } })) }))
    try {
      const result = calculateOfficial(rules, submissions)
      const placements = method === 'rank_based' ? judges.map(judge => calculateOfficial({ ...rules, judges: [judge] }, submissions.filter(s => s.judge_id === judge.judgeId)).results) : null
      const retained = method === 'lowest_removal' ? [...numericTotals].sort((a, b) => a - b).slice(Number(sampleConfig.dropLowest ?? 0), count - Number(sampleConfig.dropHighest ?? 0)) : null
      return { result, judges, numericTotals, placements, names, sampleConfig, retained }
    } catch { return { invalid: true } }
  }, [config, readiness.panels.minimum, readiness.panels.total, method, illustrative])
  if (method === 'undecided' || !SCORING_METHODS.some(m => m.id === method)) return <p className="text-sm text-v-text-muted">Choose an official scoring method to preview how results will be calculated.</p>
  if (method === 'manual') return <div className="space-y-3"><p className="text-sm text-v-text-muted">An authorized person records documented placements. A different appointed reviewer checks them before final approval. VOTRIX does not calculate a numeric score for this method.</p><div className="overflow-x-auto rounded-lg border border-v-border"><table className="v-table w-full"><thead><tr><th>Contestant</th><th>Sample approved placement</th></tr></thead><tbody>{['John', 'Mark', 'Paul'].map((name, i) => <tr key={name}><td>{name}</td><td>{i + 1}</td></tr>)}</tbody></table></div><p className="text-xs text-v-text-subtle">Manual ties and placement numbers must follow the documented competition procedure.</p></div>
  if (example?.pending) return <p className="text-sm text-v-text-muted">Add scoring judges in the Judges step and choose removal counts that keep at least one total. A valid educational example will then appear.</p>
  if (example?.invalid) return <p className="text-sm text-v-text-muted">Complete the precision and removal settings to see a valid example.</p>
  const label = { weighted_average: 'Average Score', sum: 'Total Score', highest_score: 'Highest', lowest_removal: 'Average after removal', rank_based: 'Rank-Based Placement' }[method]
  return <div className="space-y-3">
    <div className="overflow-x-auto rounded-lg border border-v-border"><table className="v-table w-full"><caption className="sr-only">Fictional example: {SCORING_METHODS.find(m => m.id === method).name}</caption><thead><tr><th>Contestant</th>{example.judges.map((j, i) => <th key={j.judgeId}>{method === 'rank_based' ? `J${i + 1} rank` : `Judge ${i + 1}`}</th>)}<th>{label}</th></tr></thead><tbody>{example.names.map(name => <tr key={name}><td>{name}</td>{example.judges.map((j, i) => <td key={j.judgeId}>{example.placements ? example.placements[i].find(r => r.contestantId === name).placementTotal : example.numericTotals[i]}</td>)}<td className="font-semibold">{example.result.results.find(r => r.contestantId === name).finalScore}</td></tr>)}</tbody></table></div>
    {['weighted_average', 'sum'].includes(method) && <p className="text-sm text-v-text-muted">Formula: <span className="font-mono">{method === 'weighted_average' ? `(${example.numericTotals.join(' + ')}) / ${example.judges.length}` : example.numericTotals.join(' + ')}</span></p>}
    {method === 'weighted_average' && <div className="space-y-2 rounded-lg border border-v-border bg-v-surface-elevated p-3 text-sm text-v-text-muted">
      <p className="font-semibold text-v-text">How Average Score is computed</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Calculate each judge's weighted total from the configured criteria.</li>
        <li>Add the completed judge totals: <span className="font-mono">90 + 86 + 92 = 268</span>.</li>
        <li>Divide by the number of completed judges: <span className="font-mono">268 / 3 = 89.33</span>.</li>
        <li>Use <span className="font-mono">89.33</span> as the contestant's final score. Higher scores rank first.</li>
      </ol>
    </div>}
    {method === 'rank_based' && <div className="space-y-2 rounded-lg border border-v-border bg-v-surface-elevated p-3 text-sm text-v-text-muted">
      <p className="font-semibold text-v-text">How Rank-Based Placement is computed</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Calculate each contestant's weighted total for each judge.</li>
        <li>Rank contestants separately for every judge. The highest weighted total receives placement 1.</li>
        <li>Add each contestant's placements across judges. For example: <span className="font-mono">John 1 + 2 + 1 = 4</span>.</li>
        <li>Use the placement total as the final result. The lowest placement total ranks first.</li>
      </ol>
    </div>}
    <p className="text-sm text-v-text-muted">{({ weighted_average: 'VOTRIX averages the completed weighted judge totals. Higher averages rank first.', sum: 'VOTRIX adds the completed weighted judge totals. Higher totals rank first.', highest_score: 'The highest submitted weighted judge total determines this result.', lowest_removal: `Remove ${example.sampleConfig.dropHighest ?? 0} highest and ${example.sampleConfig.dropLowest ?? 0} lowest judge totals. Remaining: ${(example.retained ?? []).join(', ')}. Average the remaining totals.`, rank_based: 'Lower placement totals are better. In this example, John and Mark tie with 4, while Paul has 9, subject to the published tie rules.' })[method]}</p>
    {method === 'rank_based' && <p className="text-xs text-v-text-subtle">Within one judge’s ranking, equal totals share placements such as 1, 1, 3. Equal combined sums also share ranks.</p>}
    {method === 'lowest_removal' && <p className="text-xs text-v-text-subtle">{illustrative ? 'Illustration: three fictional judges with one highest and one lowest total removed. Choose your actual counts in Settings; they are checked against assigned panels before publication.' : `This fictional example uses ${example.judges.length} judges and the configured removal counts. Actual panels are checked before publication.`}</p>}
  </div>
}
