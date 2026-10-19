import { OFFICIAL_METHODS, scopeAllows } from './competition-calculation.js'
import {progressionIssues} from './competition-progression-validation.js'

export const SCORING_METHODS = [
  { id: 'weighted_average', name: 'Average of judge scores', description: 'Average the weighted totals from all judges.' },
  { id: 'sum', name: 'Sum of judge scores', description: 'Add the weighted totals from all judges.' },
  { id: 'rank_based', name: 'Rank-based placement', description: 'Rank contestants for each judge, then combine their placements.' },
  { id: 'highest_score', name: 'Highest judge score', description: 'Use the highest valid judge total.' },
  { id: 'lowest_removal', name: 'Remove extreme scores', description: 'Remove the configured highest and lowest judge totals before averaging.' },
  { id: 'manual', name: 'Manual official results', description: 'Record approved results through an authorized manual procedure.' },
].filter(method => OFFICIAL_METHODS.includes(method.id))

export const SCORING_METHOD_OPTIONS = [
  { ...SCORING_METHODS.find(method => method.id === 'weighted_average'), name: 'Average Score' },
  { ...SCORING_METHODS.find(method => method.id === 'sum'), name: 'Total Score' },
  { ...SCORING_METHODS.find(method => method.id === 'rank_based'), name: 'Rank-Based Placement' },
  { ...SCORING_METHODS.find(method => method.id === 'manual'), name: 'Manual Official Results' },
]

export const getScoringMethodOptions = currentMethod => {
  const legacyMethod = SCORING_METHODS.find(method =>
    ['highest_score', 'lowest_removal'].includes(method.id) && method.id === currentMethod,
  )

  return legacyMethod ? [...SCORING_METHOD_OPTIONS, legacyMethod] : SCORING_METHOD_OPTIONS
}

export function activeScoringJudge(judge) {
  return judge.isActive !== false && (!judge.accountStatus || judge.accountStatus === 'active') && ['judge', 'head_judge'].includes(judge.role)
}
export function eligibleReviewers(foundation, actorId) {
  return (foundation.judges ?? []).filter(j => j.role === 'score_reviewer' && j.isActive !== false
    && (!j.accountStatus || j.accountStatus === 'active') && j.judgeId !== actorId)
}
export function resultRoundPolicy(foundation, config) {
  const rounds = [...(foundation.rounds ?? [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  const explicit = rounds.find(r => r.id === config.finalRoundId)
  const final = explicit ?? rounds.filter(r => r.purpose === 'final').at(-1) ?? (rounds.length === 1 ? rounds[0] : null)
  const mainRounds = rounds.filter(r => r.purpose !== 'special')
  const missing = Boolean(config.finalRoundId && !explicit)
  if (!rounds.length) return { mode: 'flat', name: 'Event-wide scores', description: 'All configured criteria contribute to the event result.', final: null, mainRounds, missing }
  if (final?.progression === 'back_to_zero') return { mode: 'independent', name: final.name, description: `${final.name} alone determines official placements. Earlier rounds do not add points to this result (Back to Zero).`, final, mainRounds, missing }
  if (final?.progression === 'carry_forward') return { mode: 'carry_forward', name: `Scores through ${final.name}`, description: `Earlier applicable round results are added to ${final.name}. Round contribution weights are not used for this carry-forward result.`, final, mainRounds, missing }
  return { mode: 'weighted', name: 'Configured round contributions', description: 'The configured round contributions are combined to determine winners. Independent special awards keep their own standings.', final, mainRounds, missing }
}
export function scoringPanelSizes(foundation) {
  const judges = (foundation.judges ?? []).filter(activeScoringJudge).map(j => ({ ...j, assignments: (foundation.assignments ?? []).filter(a => a.judgeId === j.id) }))
  const rounds = foundation.rounds?.length ? foundation.rounds : [{ id: null }]
  const sizes = rounds.flatMap(round => (foundation.contestants ?? []).filter(e => !round.id || round.contestantIds?.includes(e.id))
    .map(entry => judges.filter(j => scopeAllows(j, entry, round.id ? round : null, foundation.event?.id)).length))
  return { total: judges.length, minimum: sizes.length ? Math.min(...sizes) : judges.length, hasEntries: sizes.length > 0 }
}

// These checks validate configuration, never calculate competition scores.
// Draft saves may retain unfinished review/penalty setup; publication remains strict.
export function scoringRuleReadiness(foundation, config = foundation.scoringConfig ?? {}, actorId) {
  const issues = [], pending = []
  const add = (field, message) => issues.push({ field, message })
  const method = config.calculationMethod
  for(const round of foundation.rounds ?? [])for(const issue of progressionIssues(round,foundation.rounds,method))add('roundProgression',`${round.name ?? 'Round'}: ${issue}`)
  if (!SCORING_METHODS.some(m => m.id === method)) add('calculationMethod', 'Choose an official scoring method before confirming the rules.')
  if (config.decimalPlaces === '' || !Number.isInteger(Number(config.decimalPlaces)) || Number(config.decimalPlaces) < 0 || Number(config.decimalPlaces) > 6) add('decimalPlaces', 'Choose 0–6 decimal places.')
  if (!['shared', 'highest_criterion'].includes(config.tiePolicy)) add('tiePolicy', 'Choose a supported way to handle tied placements.')
  if (method === 'rank_based' && config.tiePolicy !== 'shared') add('tiePolicy', 'Rank-based placement uses shared judge placements and shared final ranks.')
  if (method === 'manual' && !String(config.manualBasis ?? '').trim()) add('manualBasis', 'Describe the official source and approval procedure for manual results.')
  // Manual results always require independent approval in the existing SQL
  // workflow, even when a historical config stores the optional flag as false.
  for (const key of ['dropHighest', 'dropLowest']) if (config[key] === '' || !Number.isInteger(Number(config[key] ?? 0)) || Number(config[key] ?? 0) < 0) add(key, 'Enter a whole number of judge totals, zero or more.')
  const panels = scoringPanelSizes(foundation)
  if (method === 'lowest_removal') {
    const drops = Number(config.dropHighest ?? 0) + Number(config.dropLowest ?? 0)
    if (!panels.total || !panels.hasEntries) pending.push({ field: 'judgePanel', message: 'Judge removal counts will be checked against each assigned panel after contestants and judges are added.' })
    if (panels.total && drops >= panels.minimum) add('judgePanel', `Keep at least one judge total. The smallest available scoring panel has ${panels.minimum} ${panels.minimum === 1 ? 'judge' : 'judges'}.`)
  }
  const policy = resultRoundPolicy(foundation, config)
  if (policy.missing) add('finalRoundId', 'The saved result round is unavailable. Choose a valid source for the overall result.')
  if ((foundation.rounds ?? []).length > 1 && !policy.final && !policy.mainRounds.some(r => (r.progression ?? 'weighted') === 'weighted')) add('finalRoundId', 'Choose which independent round determines the overall winners.')
  const deductions = config.deductionRules ?? []
  if (!Array.isArray(deductions)) add('deductionRules', 'Penalty rules must be a list.')
  else {
    if (new Set(deductions.map(r => r?.id)).size !== deductions.length) add('deductionRules', 'Each penalty rule needs a unique reference.')
    if (method === 'manual' && deductions.length) add('deductionRules', 'Manual official placements do not support automatic point deductions. Remove these rules explicitly before confirming.')
    for (const rule of deductions) {
      if (!rule?.id || !String(rule.description ?? '').trim() || !Number.isFinite(Number(rule.amount)) || Number(rule.amount) <= 0) add('deductionRules', 'Each penalty rule needs a description and a positive deduction amount.')
      if (rule?.units !== (method === 'rank_based' ? 'placements' : 'points')) add('deductionRules', 'Review penalty units for the selected method: placement points for rank-based results and score points for numeric results.')
      if (rule?.roundId && !foundation.rounds?.some(r => r.id === rule.roundId)) add('deductionRules', 'A penalty rule references an unavailable round.')
      if (rule?.criteriaId && !foundation.criteria?.some(c => c.id === rule.criteriaId)) add('deductionRules', 'A penalty rule references an unavailable criterion.')
      if (rule?.roundId && rule.criteriaId && !foundation.rounds?.find(r => r.id === rule.roundId)?.criteriaIds?.includes(rule.criteriaId)) add('deductionRules', 'A penalty criterion must belong to its selected round.')
    }
  }
  const reviewerRequired = config.independentApproval !== false || method === 'manual' || deductions.length > 0
  const reviewer = eligibleReviewers(foundation, actorId).find(j => j.judgeId === config.verifierId)
  if (reviewerRequired && !reviewer) pending.push({ field: 'verifierId', message: 'Assign an active authorized reviewer in Judges before Review & Publish.' })
  if (config.confirmed !== true) pending.push({ field: 'confirmed', message: 'Confirm and save the current official scoring rules before publishing.' })
  return { issues, pending, canConfirm: issues.length === 0, readyForPublication: issues.length === 0 && pending.length === 0, reviewerRequired, reviewer: reviewer ?? null, panels, policy }
}
