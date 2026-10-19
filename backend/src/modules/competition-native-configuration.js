import { ApiError } from '../utils/ApiError.js'
import { validateUUID } from '../utils/sanitize.js'
import { evaluateCriteriaReadiness } from '../../../shared/competition-criteria-readiness.js'
import { progressionIssues } from '../../../shared/competition-progression-validation.js'
import { SCORING_METHODS } from '../../../shared/competition-rule-configuration.js'
import { deductionConfigurationIssues, hasDeductionModes } from '../../../shared/competition-deductions.js'

const fail = message => { throw new ApiError(400, message) }
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const keys = (value, allowed) => { if (!object(value) || Object.keys(value).some(k => !allowed.includes(k))) fail('Unsupported configuration fields must be explicitly resolved') }
const name = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200
export function validateNativeConfiguration(raw) {
  keys(raw, ['structure', 'rounds', 'criteria', 'scoringConfig'])
  if (!['single', 'multiple'].includes(raw.structure) || !Array.isArray(raw.rounds) || !Array.isArray(raw.criteria)) fail('Choose a single phase or multiple rounds')
  if (raw.structure === 'single' && raw.rounds.length || raw.structure === 'multiple' && raw.rounds.length < 1) fail('A single phase has no rounds; round-based setup requires at least one named round')
  const config = raw.scoringConfig
  keys(config, ['calculationMethod', 'criterionBasis', 'tiePolicy', 'decimalPlaces', 'dropHighest', 'dropLowest', 'manualBasis', 'deductionRules', 'deductionMode', 'numericCarryBasis', 'inputDecimalPlaces', 'defaultMinScore', 'defaultMaxScore', 'singleRoundName'])
  if (config.criterionBasis !== undefined && !['percentage', 'points'].includes(config.criterionBasis)) fail('Choose Percentage or Points criterion scoring basis')
  if (config.singleRoundName !== undefined && !name(config.singleRoundName)) fail('Name the single round')
  if (config.defaultMinScore !== undefined || config.defaultMaxScore !== undefined) {
    if (!Number.isFinite(config.defaultMinScore) || !Number.isFinite(config.defaultMaxScore) || config.defaultMaxScore <= 0 || config.defaultMinScore >= config.defaultMaxScore) fail('Configure valid default score bounds')
  }
  if (config.numericCarryBasis !== undefined && (config.numericCarryBasis !== 'weighted_judge_average' || config.calculationMethod !== 'rank_based')) fail('Rank percentage carry requires the weighted judge average basis')
  if (![...SCORING_METHODS.map(m => m.id), 'undecided'].includes(config.calculationMethod)) fail('Choose an existing supported calculation method')
  if (!['shared', 'highest_criterion'].includes(config.tiePolicy ?? 'shared') || config.calculationMethod === 'rank_based' && config.tiePolicy === 'highest_criterion') fail('Unsupported tie policy')
  for (const key of ['decimalPlaces', 'inputDecimalPlaces', 'dropHighest', 'dropLowest']) if (config[key] !== undefined && (!Number.isInteger(config[key]) || config[key] < 0 || key.endsWith('ecimalPlaces') && config[key] > 6)) fail(`Invalid ${key}`)
  if (config.manualBasis !== undefined && typeof config.manualBasis !== 'string') fail('Manual basis must be text')
  const ids = new Set()
  const unique = id => { validateUUID(id); if (ids.has(id)) fail('Configuration IDs must be unique'); ids.add(id) }
  raw.rounds.forEach((r, index) => {
    keys(r, ['id', 'name', 'displayOrder', 'progression', 'weight', 'advancementType', 'advancementValue', 'nextRoundId', 'entryIds', 'calculationMethod', 'deductionMode'])
    unique(r.id)
    if (!name(r.name) || r.displayOrder !== index) fail('Round names and saved order must be explicit')
    if (r.calculationMethod !== undefined && !SCORING_METHODS.some(m=>m.id===r.calculationMethod) || r.calculationMethod==='manual' && config.calculationMethod!=='manual') fail('Choose a supported round calculation method')
    if (r.calculationMethod !== undefined && r.calculationMethod !== config.calculationMethod && (raw.rounds.some(x=>(x.progression??'back_to_zero')!=='back_to_zero') || !hasDeductionModes(raw) && (config.deductionRules??[]).length)) fail('Different round methods require an explicit compatible normalization policy for carry or deductions')
    if (!['back_to_zero', 'weighted', 'carry_forward'].includes(r.progression ?? 'back_to_zero')) fail('Choose an existing score carry policy')
    if ((r.progression ?? 'back_to_zero') !== 'back_to_zero' && ['rank_based', 'manual'].includes(config.calculationMethod) && !(config.calculationMethod==='rank_based' && r.progression==='weighted' && config.numericCarryBasis==='weighted_judge_average')) fail('Ordinal placements cannot be carried as numeric percentage scores without an explicit numeric basis')
    if (r.progression === 'weighted' && (!Number.isFinite(r.weight) || r.weight <= 0 || r.weight > 100)) fail('Round contribution must be a percentage')
    if (index === raw.rounds.length - 1 && ((r.advancementType ?? 'none') !== 'none' || r.nextRoundId != null)) fail('The last round cannot advance to another round')
    if (r.entryIds !== undefined) { if (!Array.isArray(r.entryIds) || new Set(r.entryIds).size !== r.entryIds.length) fail('Round entry IDs must be a unique list'); r.entryIds.forEach(validateUUID) }
    if (r.calculationMethod === 'rank_based' && (config.tiePolicy ?? 'shared') !== 'shared') fail('Rank-based rounds require shared ranking')
    const issues = progressionIssues(r, raw.rounds, r.calculationMethod ?? config.calculationMethod)
    if (issues.length) fail(issues.join(' '))
  })
  if (raw.rounds.some(r => r.progression === 'weighted') && raw.rounds.some(r => r.progression !== 'weighted')) fail('Mixed weighted and additive/independent round contributions require an explicit compatible policy')
  raw.criteria.forEach(c => {
    keys(c, ['id', 'name', 'roundId', 'percentage', 'minScore', 'maxScore', 'minorCriteria', 'decimalPlaces'])
    unique(c.id)
    if (c.decimalPlaces !== undefined && (!Number.isInteger(c.decimalPlaces) || c.decimalPlaces < 0 || c.decimalPlaces > 6)) fail('Input decimal places must be between 0 and 6')
    const pointsBasis = config.criterionBasis === 'points'
    if (!name(c.name) || (!pointsBasis && (!Number.isFinite(c.percentage) || c.percentage <= 0 || c.percentage > 100))) fail(pointsBasis ? 'Each major criterion requires a maximum point value' : 'Each major criterion requires a name and positive percentage')
    if (pointsBasis && (!Number.isFinite(c.maxScore) || c.maxScore <= 0)) fail('Each major criterion requires a positive maximum point value')
    if (raw.structure === 'single' && c.roundId != null || raw.structure === 'multiple' && !raw.rounds.some(r => r.id === c.roundId)) fail('Criterion must belong to its explicit round or NULL single phase')
    if (c.minorCriteria !== undefined && !Array.isArray(c.minorCriteria)) fail('Minor criteria must be a list')
    const targets = c.minorCriteria?.length ? c.minorCriteria : [c]
    targets.forEach(m => {
      if (m !== c) { keys(m, ['id', 'name', 'minScore', 'maxScore', 'percentage', 'decimalPlaces']); unique(m.id); if (!name(m.name)) fail('Name each minor criterion') }
      if (m.decimalPlaces !== undefined && (!Number.isInteger(m.decimalPlaces) || m.decimalPlaces < 0 || m.decimalPlaces > 6)) fail('Input decimal places must be between 0 and 6')
      if (!(pointsBasis && m !== c) && (!Number.isFinite(m.minScore) || !Number.isFinite(m.maxScore) || m.maxScore <= 0 || m.minScore >= m.maxScore)) fail('Configure valid existing score bounds')
    })
    if (!pointsBasis && targets.some(m => m !== c && m.percentage !== undefined)) {
      if (targets.some(m => !Number.isFinite(m.percentage) || m.percentage <= 0 || m.percentage > 100)) fail('Give every weighted minor criterion a positive percentage')
      if (Math.abs(targets.reduce((total,m) => total + m.percentage,0) - 100) > 0.001) fail('Minor criterion weights must total 100% within their major criterion')
    }
  })
  const duplicateNames = rows => new Set(rows.map(r => r.name.trim().toLowerCase())).size !== rows.length
  if (duplicateNames(raw.rounds)) fail('Round names must be unique')
  for (const scope of raw.structure === 'single' ? [{id:null}] : raw.rounds) if (duplicateNames(raw.criteria.filter(c => c.roundId == scope.id))) fail('Major criterion names must be unique within a round')
  for (const c of raw.criteria) if (duplicateNames(c.minorCriteria ?? [])) fail('Minor criterion names must be unique within a major criterion')
  if (config.deductionRules !== undefined && !Array.isArray(config.deductionRules)) fail('Deduction rules must be a list')
  const penalties = new Set()
  for (const rule of config.deductionRules ?? []) {
    keys(rule, ['id', 'description', 'amount', 'units', 'roundId', 'criteriaId', 'appliedBy', 'perViolation', 'maxOccurrences'])
    if (!name(rule.id) || penalties.has(rule.id) || !name(rule.description) || !Number.isFinite(rule.amount) || rule.amount <= 0 || !(hasDeductionModes(raw) || config.calculationMethod === 'rank_based' ? ['points','placements'] : ['points']).includes(rule.units) || config.calculationMethod === 'manual') fail('Deduction rules must retain the existing method and unit semantics')
    penalties.add(rule.id)
    if (rule.roundId != null && !raw.rounds.some(r => r.id === rule.roundId)) fail('Deduction references another round')
    if (rule.criteriaId != null && !raw.criteria.some(c => c.id === rule.criteriaId && (rule.roundId == null || c.roundId === rule.roundId))) fail('Deduction references another criterion scope')
    const penaltyRound = rule.roundId ?? raw.criteria.find(c=>c.id===rule.criteriaId)?.roundId ?? null
    if (config.numericCarryBasis && rule.units==='placements' && penaltyRound!=null && penaltyRound!==raw.rounds.at(-1)?.id) fail('Percentage carry uses point deductions in earlier rounds; placement penalties apply only to the final ranking')
  }
  const deductionIssues = deductionConfigurationIssues(raw)
  if (deductionIssues.length) fail(deductionIssues.join(' '))
  const readiness = nativeCriteriaReadiness(raw)
  if (readiness.scopes.some(s => s.total > 100.001)) fail('Major weights cannot exceed 100% within a scope')
  return structuredClone(raw)
}
export function nativeCriteriaReadiness(configuration) {
  return evaluateCriteriaReadiness({ rounds: configuration.rounds.map(r => ({ ...r, criteriaIds: configuration.criteria.filter(c => c.roundId === r.id).map(c => c.id) })), criteria: configuration.criteria, scoringConfig: configuration.scoringConfig })
}
export function nativeSetupEnabled() {
  return process.env.COMPETITION_CHILD_CONTEXTS_ENABLED === 'true' && process.env.COMPETITION_NATIVE_SETUP_ENABLED === 'true'
}
