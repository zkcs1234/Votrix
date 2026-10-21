import { setupReadiness } from '../../../shared/competition-setup-readiness.js'

// Reuse the existing validators while excluding incomplete criteria in other
// rounds. The full configuration still supplies shared settings and scope rules.
export function roundScoringReadiness(configuration, roundId) {
  if (!configuration) return { ready: false, issues: ['Save the round structure first.'] }
  const round = configuration.rounds.find(item => item.id === roundId)
  if (configuration.structure === 'multiple' && !round) return { ready: false, issues: ['Choose a round in this competition.'] }
  const criteria = configuration.criteria.filter(item => (item.roundId ?? null) === (roundId ?? null))
  const scoped = setupReadiness({
    structure: 'single', rounds: [], criteria: criteria.map(item => ({ ...item, roundId: null })),
    scoringConfig: { ...configuration.scoringConfig, calculationMethod: round?.calculationMethod ?? configuration.scoringConfig.calculationMethod, deductionRules: [] },
  })
  const full = setupReadiness(configuration)
  const issues = [...new Set([...full.issues.structure, ...scoped.issues.criteria, ...scoped.issues['score-sheet'], ...full.issues['score-sheet'], ...full.issues.deductions])]
  return { ready: issues.length === 0, issues }
}
