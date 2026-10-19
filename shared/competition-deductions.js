// Frozen deduction ownership and scope, shared by setup, scoring and reports.
// Missing ownership retains the historical organizer + reviewer workflow.
export const DEDUCTION_MODES = ['none', 'organizer', 'judge']
export const DEDUCTION_LABELS = { none: 'No Deductions', organizer: 'Organizer Applies Deductions', judge: 'Judges Apply Deductions' }
export const deductionOwner = rule => rule.appliedBy ?? 'organizer'
export const deductionLimit = rule => rule.perViolation ? rule.maxOccurrences ?? 1 : 1
export const hasDeductionModes = configuration => configuration?.scoringConfig?.deductionMode !== undefined || configuration?.rounds?.some(round => round.deductionMode !== undefined)
export function ruleRoundId(configuration, rule) {
  const criterion = configuration.criteria?.find(item => item.id === rule.criteriaId)
  return rule.roundId ?? criterion?.roundId ?? (rule.criteriaId ? configuration.rounds?.find(round => round.criteriaIds?.includes(rule.criteriaId))?.id : null) ?? null
}
export function effectiveDeductionMode(configuration, roundId) {
  const config = configuration.scoringConfig ?? {}
  const fallback = config.deductionMode ?? ((config.deductionRules ?? []).length ? 'organizer' : 'none')
  const round = configuration.rounds?.find(item => item.id === roundId)
  return round?.deductionMode ?? fallback
}
export function ruleDeductionMode(configuration, rule) {
  const scope = ruleRoundId(configuration, rule)
  return effectiveDeductionMode(configuration, scope ?? configuration.rounds?.at(-1)?.id ?? null)
}
export function rulesForDeductionRound(configuration, roundId, owner = null) {
  if (!configuration) return []
  const multiple = configuration.structure === 'multiple' || configuration.rounds?.length > 0
  const last = configuration.rounds?.at(-1)?.id
  const mode = effectiveDeductionMode(configuration, roundId)
  return (configuration.scoringConfig?.deductionRules ?? []).filter(rule => {
    const role = deductionOwner(rule), scope = ruleRoundId(configuration, rule)
    return (!owner || role === owner) && (!hasDeductionModes(configuration) || role === mode) &&
      (scope != null ? scope === roundId : !multiple ? roundId == null : roundId === last)
  })
}
export function applicableDeductionRules(configuration, roundId, owner = null) {
  const round = configuration?.rounds?.find(item => item.id === roundId)
  const contributing = round && (round.progression === 'carry_forward' || round.progression === 'weighted' && round.id === configuration.rounds.at(-1)?.id)
    ? configuration.rounds.filter(item => item.displayOrder <= round.displayOrder) : [{ id: roundId }]
  return [...new Map(contributing.flatMap(item => rulesForDeductionRound(configuration, item.id, owner)).map(rule => [rule.id, rule])).values()]
}
export function deductionAnchor(configuration, rule, roundId) {
  return rule.criteriaId ?? configuration.criteria?.find(item => (item.roundId ?? null) === roundId || item.roundId === undefined && configuration.rounds?.find(round => round.id === roundId)?.criteriaIds?.includes(item.id))?.id ?? null
}
export function deductionStage(rule) {
  if (!rule.appliedBy) return 'Historical organizer aggregate penalty; independent approval required'
  if (rule.units === 'placements') return rule.appliedBy === 'judge' ? 'Added to this judge’s placement after ranking' : 'Added to the panel placement total'
  if (rule.criteriaId) return rule.appliedBy === 'judge' ? 'Subtracted from this judge’s criterion contribution before combining judge totals' : 'Subtracted from each judge’s criterion contribution before combining judge totals'
  return rule.appliedBy === 'judge' ? 'Subtracted from this judge’s total before combining judge totals' : 'Subtracted after judge totals are combined (before placement ranking for rank-based scoring)'
}
export function validJudgeDeductionRecords(records, rules) {
  const ids = new Set(), offenses = new Set(), counts = new Map()
  return records.every(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
      Object.keys(record).some(key => !['id', 'ruleId', 'offenseKey', 'reason'].includes(key))) return false
    const rule = rules.find(item => item.id === record.ruleId)
    const hasOffenseKey = typeof record.offenseKey === 'string' && record.offenseKey.trim().length > 0
    const hasReason = typeof record.reason === 'string' && record.reason.trim().length >= 5
    if (!rule || !record.id || ids.has(record.id) || hasOffenseKey !== hasReason) return false
    if (hasOffenseKey) {
      const offense = `${record.ruleId}:${record.offenseKey.trim().toLowerCase()}`
      if (offenses.has(offense)) return false
      offenses.add(offense)
    }
    ids.add(record.id); counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1)
    return counts.get(rule.id) <= deductionLimit(rule)
  })
}
export function deductionConfigurationIssues(configuration) {
  const issues = [], config = configuration.scoringConfig ?? {}, rounds = configuration.rounds ?? [], criteria = configuration.criteria ?? []
  const rules = config.deductionRules ?? []
  if (!Array.isArray(rules)) return ['Deduction rules must be a list.']
  if (rules.length > 100) issues.push('Configure no more than 100 deduction rules per competition.')
  if (config.deductionMode !== undefined && !DEDUCTION_MODES.includes(config.deductionMode)) issues.push('Choose a supported competition deduction default.')
  for (const round of rounds) if (round.deductionMode != null && !DEDUCTION_MODES.includes(round.deductionMode)) issues.push('Choose a supported round deduction mode or inherit the competition default.')
  const identities = new Set()
  for (const rule of rules) {
    const scope = ruleRoundId(configuration, rule), mode = ruleDeductionMode(configuration, rule)
    const method = rounds.find(round => round.id === (scope ?? rounds.at(-1)?.id))?.calculationMethod ?? config.calculationMethod
    if (!rule.id || identities.has(rule.id)) issues.push('Each deduction rule needs a unique identifier.')
    identities.add(rule.id)
    if (!String(rule.description ?? '').trim() || !Number.isFinite(rule.amount) || rule.amount <= 0 || rule.amount > 1000000) issues.push('Name every deduction rule and enter an amount greater than 0 and no more than 1,000,000.')
    if (rule.appliedBy !== undefined && !['judge', 'organizer'].includes(rule.appliedBy)) issues.push('Each rule must have one responsible role.')
    if (rule.appliedBy && !hasDeductionModes(configuration)) issues.push('Choose a deduction mode before assigning responsibility to a rule.')
    if (hasDeductionModes(configuration) && !rule.appliedBy) issues.push('Choose one responsible role for every rule before saving the new deduction settings.')
    if (hasDeductionModes(configuration) && deductionOwner(rule) !== mode) issues.push(`Rule "${rule.description}" conflicts with its round’s deduction mode. Edit or remove the rule.`)
    if (method === 'manual' || !['points', 'placements'].includes(rule.units) || rule.units === 'placements' && method !== 'rank_based') issues.push('Use score points for numeric methods; placement penalties require rank-based scoring.')
    if (rule.roundId != null && !rounds.some(round => round.id === rule.roundId)) issues.push('A deduction references an unavailable round.')
    if (rule.criteriaId != null && !criteria.some(criterion => criterion.id === rule.criteriaId && (rule.roundId == null || criterion.roundId === rule.roundId || rounds.find(round => round.id === rule.roundId)?.criteriaIds?.includes(criterion.id)))) issues.push('A deduction criterion must belong to its selected round.')
    if (rule.perViolation !== undefined && typeof rule.perViolation !== 'boolean' || rule.maxOccurrences !== undefined && (!Number.isInteger(rule.maxOccurrences) || rule.maxOccurrences < 1 || rule.maxOccurrences > 100) || !rule.perViolation && (rule.maxOccurrences ?? 1) !== 1) issues.push('Allow 1–100 occurrences per entry and enable per-violation deductions to permit repeats.')
    if (rule.criteriaId && rule.units === 'placements') issues.push('Placement penalties apply to a judge or round placement, not a numeric criterion contribution.')
    if (rule.appliedBy === 'judge' && scope == null && rounds.length && rounds.at(-1).progression && rounds.at(-1).progression !== 'back_to_zero' && config.numericCarryBasis !== 'weighted_judge_average') issues.push('Use a round or criterion scope for judge deductions in combined-round numeric competitions. Competition-final judge deductions require an independent final round or numeric rank carry.')
    if (rules.some(other => other !== rule && deductionOwner(other) === deductionOwner(rule) && String(other.description).trim().toLowerCase() === String(rule.description).trim().toLowerCase() && (ruleRoundId(configuration, other) ?? rounds.at(-1)?.id ?? null) === (scope ?? rounds.at(-1)?.id ?? null) && (!other.criteriaId || !rule.criteriaId || other.criteriaId === rule.criteriaId))) issues.push('Overlapping rules for the same offense must be combined or given distinct violation definitions.')
  }
  return [...new Set(issues)]
}

// Resolve only saved, configured judge records. Client-supplied amounts, units,
// owners or stages never become engine input.
export function submittedJudgeDeductions(configuration, scopes) {
  const records = [], ids = new Set(), offenses = new Set(), counts = new Map()
  for (const scope of scopes) for (const submission of scope.submissions ?? []) for (const source of submission.sources ?? []) {
    const saved = source.deductions ?? []
    if (!Array.isArray(saved)) throw new Error('Invalid submitted deduction records')
    for (const record of saved) {
      const roundId = scope.session.round_id ?? null
      const rule = rulesForDeductionRound(configuration, roundId, 'judge').find(item => item.id === record.ruleId)
      if (!rule || deductionAnchor(configuration, rule, roundId) !== source.criterion_id || !scope.session.entry_ids.includes(source.entry_id)) throw new Error('Judge deduction does not belong to this frozen scoring scope')
      if (Object.keys(record).some(key => !['id', 'ruleId', 'offenseKey', 'reason'].includes(key)) || !record.id || !String(record.offenseKey ?? '').trim() || String(record.reason ?? '').trim().length < 5) throw new Error('Judge deductions require a violation reference and a reason of at least five characters')
      const group = `${submission.judge_id}:${roundId}:${source.entry_id}:${rule.id}`, offense = `${group}:${record.offenseKey.trim().toLowerCase()}`
      if (ids.has(record.id) || offenses.has(offense)) throw new Error('Duplicate judge deduction')
      ids.add(record.id); offenses.add(offense); counts.set(group, (counts.get(group) ?? 0) + 1)
      if (counts.get(group) > deductionLimit(rule)) throw new Error('Judge deduction exceeds the configured occurrence limit')
      records.push({ id: record.id, rule_id: rule.id, description: rule.description, judge_id: submission.judge_id, contestant_id: source.entry_id, round_id: roundId, criteria_id: rule.criteriaId ?? null, competition_scope: configuration.rounds?.length > 0 && ruleRoundId(configuration,rule) == null, amount: rule.amount, units: rule.units, reason: record.reason, offense_key: record.offenseKey, submission_id: submission.id, appliedBy: 'judge' })
    }
  }
  return records
}
