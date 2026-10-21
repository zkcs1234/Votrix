import { evaluateCriteriaReadiness } from './competition-criteria-readiness.js'
import { progressionIssues } from './competition-progression-validation.js'
import { SCORING_METHODS } from './competition-rule-configuration.js'

export function setupReadiness(value) {
  const structure = [], criteria = [], sheet = [], deductions = []
  const rounds = value.rounds ?? [], majors = value.criteria ?? [], config = value.scoringConfig ?? {}
  const named = items => items.every(x => typeof x.name === 'string' && x.name.trim() && x.name.length <= 200)
  const duplicate = items => new Set(items.map(x => x.name?.trim().toLowerCase())).size !== items.length
  if (!['single','multiple'].includes(value.structure) || value.structure === 'single' && rounds.length) structure.push('Choose a valid single-phase or multiple-round structure.')
  if (value.structure === 'multiple' && rounds.length < 2) structure.push('Add at least two rounds to continue with a multiple-round setup.')
  if (!named(rounds) || duplicate(rounds)) structure.push('Give each round a unique name.')
  if (config.singleRoundName !== undefined && !String(config.singleRoundName).trim()) structure.push('Name the single round.')
  for (const r of rounds) structure.push(...progressionIssues(r, rounds, r.calculationMethod ?? config.calculationMethod))
  if (rounds.some(r => r.progression === 'weighted')) {
    if (rounds.some(r => r.progression !== 'weighted' || !(r.weight > 0 && r.weight <= 100)) || Math.abs(rounds.reduce((s,r) => s + (Number(r.weight)||0), 0)-100)>0.001) structure.push('Round contributions must be positive and total 100%.')
    if (['manual','rank_based'].includes(config.calculationMethod) && config.numericCarryBasis !== 'weighted_judge_average') structure.push('This method requires independent rounds or an explicit numeric carry basis.')
  }
  const readiness = evaluateCriteriaReadiness({ rounds: rounds.map(r => ({ ...r, criteriaIds: majors.filter(c => c.roundId === r.id).map(c => c.id) })), criteria: majors, scoringConfig: config })
  criteria.push(...readiness.scopes.flatMap(s => s.issues.map(i => `${rounds.length ? s.name + ': ' : ''}${i.message}`)))
  for (const scope of rounds.length ? rounds : [{id:null}]) {
    const own = majors.filter(c => c.roundId == scope.id)
    if (!named(own) || duplicate(own)) criteria.push('Give major criteria unique names within each round.')
  }
  for (const c of majors) if (!named(c.minorCriteria ?? []) || duplicate(c.minorCriteria ?? [])) criteria.push(`${c.name}: give minor criteria unique names.`)
  if (!SCORING_METHODS.some(m => m.id === config.calculationMethod)) sheet.push('Choose a scoring method.')
  if (!majors.length) sheet.push('Add criteria before configuring judge inputs.')
  if (!['percentage', 'points'].includes(config.criterionBasis ?? 'percentage')) sheet.push('Choose Percentage or Points criterion scoring basis.')
  if (config.calculationMethod === 'manual' && !config.manualBasis?.trim()) sheet.push('Describe the basis for manual results.')
  if (config.calculationMethod === 'rank_based' && config.tiePolicy === 'highest_criterion') sheet.push('Rank-based scoring requires shared ranks.')
  for (const key of ['decimalPlaces','inputDecimalPlaces']) if (config[key] !== undefined && (!Number.isInteger(config[key]) || config[key] < 0 || config[key] > 6)) sheet.push('Choose a precision between 0 and 6 decimal places.')
  if (config.defaultMinScore !== undefined && (!Number.isFinite(config.defaultMinScore) || !Number.isFinite(config.defaultMaxScore) || config.defaultMinScore >= config.defaultMaxScore || config.defaultMaxScore <= 0)) sheet.push('Default maximum must exceed the minimum and zero.')
  for (const c of majors) for (const target of c.minorCriteria?.length ? c.minorCriteria : [c]) if (target.decimalPlaces !== undefined && (!Number.isInteger(target.decimalPlaces) || target.decimalPlaces < 0 || target.decimalPlaces > 6)) sheet.push(`${target.name}: choose 0–6 input decimal places.`)
  for (const key of ['dropHighest','dropLowest']) if (!Number.isInteger(config[key] ?? 0) || (config[key] ?? 0) < 0) sheet.push('Judge removal counts must be whole numbers, zero or more.')
  if (rounds.some(r => r.calculationMethod && r.calculationMethod !== config.calculationMethod) && (rounds.some(r => (r.progression ?? 'back_to_zero') !== 'back_to_zero') || !hasDeductionModes(value) && config.deductionRules?.length)) sheet.push('Different round methods require independent rounds and compatible deduction units.')
  const rules = config.deductionRules ?? []
  if (config.calculationMethod === 'manual' && rules.length) deductions.push('Manual results cannot use automatic deductions. Remove rules explicitly or change the method.')
  if (!hasDeductionModes(value) && new Set(rules.map(r => r.description?.trim().toLowerCase())).size !== rules.length) deductions.push('Give each deduction rule a unique name.')
  deductions.push(...deductionConfigurationIssues(value))
  for (const r of rules) {
    if (!r.description?.trim() || !Number.isFinite(r.amount) || r.amount <= 0) deductions.push('Each deduction needs a name and a positive value.')
    if (!hasDeductionModes(value) && !(config.calculationMethod === 'rank_based' ? ['points','placements'] : ['points']).includes(r.units)) deductions.push('Review deduction units for this scoring method.')
    if (r.roundId != null && !rounds.some(x => x.id === r.roundId) || r.criteriaId != null && !majors.some(x => x.id === r.criteriaId && (r.roundId == null || x.roundId === r.roundId))) deductions.push('A deduction references a removed round or criterion. Update its scope explicitly.')
    if (config.numericCarryBasis && r.units === 'placements' && r.roundId != null && r.roundId !== rounds.at(-1)?.id) deductions.push('Placement penalties apply only to the final round when using percentage carry.')
  }
  const issues = {structure:[...new Set(structure)],criteria:[...new Set(criteria)],'score-sheet':[...new Set(sheet)],deductions:[...new Set(deductions)]}
  return {issues, ready:Object.fromEntries(Object.entries(issues).map(([key,list]) => [key,!list.length])), allReady:Object.values(issues).every(list => !list.length)}
}
import { deductionConfigurationIssues, hasDeductionModes } from './competition-deductions.js'
