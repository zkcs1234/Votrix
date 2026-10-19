// Read-only inspection helpers. Deliberately independent of app startup, the
// database client and both calculation engines. Nothing here repairs a record.
import { createHash } from 'node:crypto'

export const COMPETITION_TABLES = [
  'events', 'event_participants', 'competition_contestants',
  'competition_categories', 'competition_divisions', 'competition_rounds',
  'competition_criteria', 'competition_minor_criteria',
  'competition_round_contestants', 'competition_round_criteria',
  'competition_judges', 'competition_judge_assignments', 'competition_sessions',
  'competition_scores', 'competition_session_judge_scores',
  'competition_round_results', 'competition_deductions',
  'competition_result_calculations', 'competition_rule_versions',
  'competition_lineups', 'competition_judge_drafts',
  'competition_round_submissions', 'competition_eligibility_decisions',
  'competition_advancement_decisions', 'competition_rule_amendments',
  'competition_criterion_lock_history', 'competition_create_requests',
  'competitions', 'competition_legacy_contexts', 'competition_entries',
  'competition_child_configurations', 'competition_child_rounds', 'competition_child_criteria',
  'competition_child_minors', 'competition_child_judge_assignments', 'competition_child_rule_versions',
  'competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads','competition_child_scoring_audit',
  'competition_child_review_policies','competition_child_deduction_decisions','competition_child_deduction_reviews','competition_child_calculations','competition_child_calculation_transitions','competition_child_qualifications',
  'competition_child_publications',
]

// These are capability probes, NOT an applied-migration ledger. Replaced RPCs
// retain their names; presence alone cannot establish their current semantics.
export const CAPABILITY_REQUIREMENTS = [
  {name:'native_navigation_108',optional:true,functions:['competition_child_judge_navigation','competition_remove_native_draft_entry']},
  {name:'native_results_107',optional:true,columns:{competition_child_publications:['id','event_id','competition_id','round_id','version','previous_id','action','calculation_id','public_snapshot','actor_id','request_id','request_payload']},functions:['competition_child_publication_action','competition_child_public_results','competition_child_owned_results','competition_child_export_sources']},
  {name:'native_official_106',optional:true,columns:{competition_child_calculations:['id','event_id','competition_id','round_id','session_id','rules_version','source_digest','source_snapshot','input_snapshot','output_snapshot','version'],competition_child_review_policies:['competition_id','event_id','participant_id','reviewer_id'],competition_child_deduction_decisions:['id','session_id','entry_id','rule_snapshot','offense_key'],competition_child_deduction_reviews:['id','decision_id','action','version'],competition_child_calculation_transitions:['calculation_id','action','actor_id'],competition_child_qualifications:['id','event_id','competition_id','from_round','to_round','calculation_id','source_digest','qualifier_ids','version']},functions:['competition_child_tabulation_snapshot','competition_child_official_calculate','competition_child_official_transition','competition_child_deduction_action','competition_child_appoint_reviewer','competition_child_confirm_qualification','competition_child_reviewer_choices']},
  {name:'native_scoring_105',optional:true,columns:{competition_child_sessions:['id','competition_id','event_id','round_id','rules_version','revision','source_revision'],competition_child_score_drafts:['session_id','judge_id','entry_id','criterion_id','scores','revision','locked'],competition_child_submissions:['id','session_id','judge_id','sources'],competition_child_submission_heads:['session_id','judge_id','submission_id'],competition_child_scoring_audit:['session_id','actor_id','request_id','payload','result']},functions:['competition_child_scoring_choices','competition_child_live_view','competition_child_live_control','competition_child_score_write']},
  { name: 'legacy_scoring', columns: { events: ['id', 'event_type', 'scoring_config'], competition_contestants: ['id', 'event_id'], competition_criteria: ['id', 'event_id', 'percentage'], competition_scores: ['id', 'judge_id', 'contestant_id', 'criteria_id', 'score'] } },
  { name: 'rounds_and_assignments', columns: { competition_rounds: ['id', 'event_id'], competition_round_contestants: ['round_id', 'contestant_id'], competition_round_criteria: ['round_id', 'criteria_id'], event_participants: ['id', 'event_id', 'user_id', 'participant_type'], competition_judge_assignments: ['participant_id', 'scope', 'scope_id'] } },
  { name: 'minor_criteria_071', columns: { competition_minor_criteria: ['id', 'event_id', 'criteria_id', 'score_type', 'custom_min', 'custom_max'], competition_scores: ['minor_criteria_id'] } },
  { name: 'submitted_workflow_087_088', columns: { events: ['official_rules_id', 'competition_lifecycle'], competition_rule_versions: ['id', 'event_id', 'version', 'snapshot'], competition_sessions: ['id', 'event_id', 'rules_version', 'access_config', 'submission_window', 'revision'], competition_round_submissions: ['id', 'session_id', 'rules_version', 'sources', 'version', 'status'], competition_judge_drafts: ['id', 'revision'], competition_result_calculations: ['rules_version', 'source_digest', 'source_versions', 'verified_at'] }, functions: ['competition_scoring_write', 'competition_operational_action', 'competition_publish_rules', 'competition_result_transition', 'competition_confirm_advancement'] },
  { name: 'decision_approval_089', columns: { competition_deductions: ['offense_key', 'decision_status', 'rules_version'] }, functions: ['competition_approve_decision'] },
  { name: 'amendments_090', columns: { competition_rule_amendments: ['id', 'event_id', 'previous_rules', 'resulting_rules'] }, functions: ['competition_approve_amendment'] },
  { name: 'source_history_093', columns: { competition_criterion_lock_history: ['id', 'score_row_id', 'scores', 'revision', 'rules_version'] }, catalogFunctions: ['competition_snapshot_immutable', 'competition_archive_lock'] },
  { name: 'projection_reconciliation_094', functions: ['competition_reconcile_projection'] },
  { name: 'criteria_publication_095', functions: ['competition_criteria_source'] },
  { name: 'participation_096_099', columns: { competition_advancement_decisions: ['automatic_qualifiers', 'selection_basis'] }, functions: ['competition_registration_source', 'competition_set_round_membership', 'competition_round_roster', 'competition_require_qualified', 'competition_progression_sources', 'competition_participation_context', 'competition_scoring_write_v095'] },
  { name: 'atomic_integrity_100', columns: { events: ['competition_setup_revision', 'competition_input_revision'], competition_result_calculations: ['source_input_revision'] }, functions: ['competition_check_relations', 'competition_reorder_divisions'], catalogFunctions: ['competition_guard_calculation_revision'] },
  { name: 'creation_idempotency_102', columns: { competition_create_requests: ['organizer_id', 'request_id', 'event_id', 'request_payload'] }, functions: ['competition_create_event'] },
  { name: 'child_identity_103', optional: true, columns: { competitions: ['id', 'event_id', 'name', 'origin'], competition_legacy_contexts: ['event_id', 'competition_id', 'mapped_by'], competition_entries: ['id', 'event_id', 'competition_id', 'contestant_id', 'entry_number'] }, functions: ['competition_create_child', 'competition_add_entry', 'competition_map_legacy_event'] },
  { name: 'native_rules_104', optional: true, columns: { competition_child_configurations: ['competition_id','event_id','configuration'], competitions: ['setup_revision','input_revision','official_child_rules_id'], competition_child_rounds: ['id','competition_id','event_id','definition'], competition_child_criteria: ['id','round_id','competition_id'], competition_child_minors: ['id','criterion_id','competition_id'], competition_child_judge_assignments: ['id','competition_id','participant_id','round_id'], competition_child_rule_versions: ['id','competition_id','setup_revision','input_revision','configuration_snapshot'] }, functions: ['competition_save_native_configuration','competition_assign_native_judge','competition_freeze_native_rules','competition_native_judge_context','competition_native_foundation'] },
]

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
export function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
export function fingerprintRows(rows) {
  // Table order is immaterial; nested arrays (rankings/sources) retain order.
  return fingerprint(rows.map(row => JSON.stringify(canonical(row))).sort())
}

const LEGACY_METHODS = ['average', 'weighted_average', 'sum', 'rank_based', 'highest_score', 'lowest_removal']
const VERSIONED_METHODS = ['weighted_average', 'sum', 'rank_based', 'highest_score', 'lowest_removal', 'manual', 'undecided']
export function describeHistoricalRules(config = {}, rounds = [], { versioned = false } = {}) {
  const method = config?.calculationMethod ?? (versioned ? null : 'weighted_average')
  return {
    engine: versioned ? 'versioned_official' : 'legacy', method,
    supported: (versioned ? VERSIONED_METHODS : LEGACY_METHODS).includes(method),
    defaultMethod: !versioned && config?.calculationMethod == null,
    normalization: 'raw / maximum * 100; minor criteria use equal mean',
    deduction: method === 'rank_based' ? 'add placement penalty after aggregation' : method === 'manual' ? 'manual placement decision; no automatic numeric penalty' : 'subtract approved points after aggregation',
    rankBasis: method === 'rank_based' ? (versioned ? 'positive placement aggregate; lower wins' : 'legacy negative finalScore; preserve placementTotal and stored rank') : 'numeric judge totals',
    transitions: rounds.map(round => ({ roundId: round.id, progression: round.progression ?? round.workflow?.progression ?? 'weighted', weight: round.weight ?? null })),
    carryForward: 'existing carry_forward adds applicable prior results; it is not percentage carry',
    cutoffTies: 'existing Top N/percentage policy includes every tied cutoff rank',
    action: 'preserve existing rules and snapshots; no implicit conversion or recalculation',
  }
}

const LINKS = {
  round_id: 'competition_rounds', current_round_id: 'competition_rounds', next_round_id: 'competition_rounds',
  category_id: 'competition_categories', division_id: 'competition_divisions', criteria_id: 'competition_criteria',
  minor_criteria_id: 'competition_minor_criteria', contestant_id: 'competition_contestants', active_contestant_id: 'competition_contestants',
  session_id: 'competition_sessions', rules_version: 'competition_rule_versions', official_rules_id: 'competition_rule_versions',
  participant_id: 'event_participants', calculation_id: 'competition_result_calculations', previous_rules: 'competition_rule_versions',
  resulting_rules: 'competition_rule_versions', score_row_id: 'competition_session_judge_scores', criterion_id: 'competition_criteria',
  competition_id: 'competitions',
}

export function analyzeCompetitionPreflight({ schema = {}, records = {}, inspections = {}, metadata = null } = {}) {
  const findings = []
  const add = (severity, code, details = {}) => findings.push({ severity, code, ...details })
  const rows = table => Array.isArray(records[table]) ? records[table] : []
  const maps = Object.fromEntries(COMPETITION_TABLES.map(table => [table, new Map(rows(table).map(row => [row.id, row]))]))
  const events = maps.events
  const eventFor = (table, row) => {
    if (table === 'events') return row.id
    if (row.event_id) return row.event_id
    if(table==='competition_child_deduction_reviews')return maps.competition_child_sessions.get(maps.competition_child_deduction_decisions.get(row.decision_id)?.session_id)?.event_id??null
    if(table==='competition_child_calculation_transitions')return maps.competition_child_calculations.get(row.calculation_id)?.event_id??null
    if(table.startsWith('competition_child_')&&row.session_id)return maps.competition_child_sessions.get(row.session_id)?.event_id??null
    for (const [field, parent] of [['round_id', 'competition_rounds'], ['contestant_id', 'competition_contestants'], ['criteria_id', 'competition_criteria'], ['participant_id', 'event_participants'], ['score_row_id', 'competition_session_judge_scores']]) {
      const match = maps[parent].get(row[field]); if (match?.event_id) return match.event_id
    }
    return null
  }
  const functions = new Set(schema.functions ?? [])
  const capabilities = CAPABILITY_REQUIREMENTS.filter(r => !r.optional || (r.name==='native_navigation_108'?schema.functions?.includes('competition_child_judge_navigation'):r.name==='native_rules_104' ? Boolean(schema.tables?.competition_child_configurations) : Object.keys(r.columns ?? {}).some(t => schema.tables?.[t]))).map(requirement => {
    const missing = [], unverified = []
    for (const [table, columns] of Object.entries(requirement.columns ?? {})) for (const column of columns) {
      if (!schema.tables?.[table]?.columns?.includes(column)) missing.push(`${table}.${column}`)
    }
    for (const name of requirement.functions ?? []) if (!functions.has(name)) missing.push(`function:${name}`)
    for (const name of requirement.catalogFunctions ?? []) {
      if (!metadata) unverified.push(`catalog-function:${name}`)
      else if (!functions.has(name)) missing.push(`function:${name}`)
    }
    return { name: requirement.name, observed: !missing.length && !unverified.length, missing, unverified, migrationExecutionVerified: false }
  })
  for (const capability of capabilities) if (capability.missing.length) add('blocker', 'missing_capability', { capability: capability.name, missing: capability.missing })
  for (const [table, inspection] of Object.entries(inspections)) if (inspection.complete !== true) add('blocker', 'incomplete_inventory', { table, reason: inspection.reason ?? 'Inspection did not complete' })
  // A missing inventory must not be mistaken for an empty historical table.
  for (const table of COMPETITION_TABLES) if (schema.tables?.[table] && !inspections[table]) add('blocker', 'uninspected_table', { table })

  const relations = []
  for (const table of COMPETITION_TABLES) for (const row of rows(table)) {
    const eventId = eventFor(table, row)
    if (eventId && !events.has(eventId)) relations.push({ table, recordId: row.id ?? null, field: 'event_id', issue: 'missing_event' })
    const links={...LINKS}
    if(table.startsWith('competition_child_')){links.round_id='competition_child_rounds';links.criterion_id='competition_child_criteria';links.session_id='competition_child_sessions';links.rules_version='competition_child_rule_versions';links.entry_id='competition_entries';links.submission_id='competition_child_submissions';links.calculation_id='competition_child_calculations';links.decision_id='competition_child_deduction_decisions';links.from_round='competition_child_rounds';links.to_round='competition_child_rounds'}
    if(table==='competition_child_publications')links.previous_id='competition_child_publications'
    if(table==='competitions')links.official_child_rules_id='competition_child_rule_versions'
    for (const [field, parent] of Object.entries(links)) {
      if (row[field] == null) continue
      // Missing schema/data is already a blocker; do not invent orphan counts.
      if (!schema.tables?.[parent] || inspections[parent]?.complete !== true) continue
      const target = maps[parent].get(row[field])
      if (!target) relations.push({ table, recordId: row.id ?? null, field, issue: 'missing_parent' })
      else if (eventId && eventFor(parent, target) !== eventId) relations.push({ table, recordId: row.id ?? null, field, issue: 'cross_event' })
      else if (field === 'minor_criteria_id' && target.criteria_id !== row.criteria_id) relations.push({ table, recordId: row.id ?? null, field, issue: 'wrong_major_criterion' })
    }
    if (table === 'competition_judge_assignments' && eventId) {
      const targetTable = { event: 'events', round: 'competition_rounds', category: 'competition_categories', division: 'competition_divisions' }[row.scope]
      const target = maps[targetTable]?.get(row.scope_id)
      if (!targetTable || (inspections[targetTable]?.complete && (!target || eventFor(targetTable, target) !== eventId))) relations.push({ table, recordId: row.id, field: 'scope_id', issue: 'invalid_assignment_scope' })
    }
    if (row.judge_id && row.participant_id && inspections.event_participants?.complete) {
      const participant = maps.event_participants.get(row.participant_id)
      if (participant && (participant.user_id !== row.judge_id || participant.participant_type !== 'COMPETITION_JUDGE')) relations.push({ table, recordId: row.id, field: 'participant_id', issue: 'wrong_judge_enrollment' })
    }
  }
  if (relations.length) add('blocker', 'historical_relation_conflicts', { count: relations.length, examples: relations.slice(0, 20) })

  function duplicates(table, key, predicate, code, severity = 'blocker') {
    const groups = new Map()
    for (const row of rows(table).filter(predicate)) { const k = JSON.stringify(key(row)); groups.set(k, (groups.get(k) ?? 0) + 1) }
    const count = [...groups.values()].filter(n => n > 1).length
    if (count) add(severity, code, { table, duplicateGroups: count })
  }
  duplicates('competition_sessions', row => [row.event_id], row => ['active', 'paused'].includes(row.status), 'multiple_live_sessions')
  duplicates('competition_scores', row => [row.judge_id, row.contestant_id, row.criteria_id, row.minor_criteria_id ?? null, row.round_id ?? null], () => true, 'ambiguous_score_cells')
  duplicates('competition_session_judge_scores', row => [row.session_id, row.judge_id, row.round_id ?? null, row.contestant_id], () => true, 'ambiguous_locked_rows')
  duplicates('competition_round_submissions', row => [row.session_id, row.judge_id, row.round_id ?? null], row => row.status === 'submitted', 'duplicate_current_submissions')
  duplicates('competition_deductions', row => [row.event_id, row.rules_version ?? null, row.contestant_id, row.offense_key], row => row.offense_key != null && row.decision_status !== 'voided', 'duplicate_offense_references')

  const ruleProfiles = []
  function inspectRules(recordId, eventId, config, rounds, versioned) {
    const profile = describeHistoricalRules(config, rounds, { versioned })
    ruleProfiles.push({ recordId, eventId, ...profile })
    if (!profile.supported) add('review', 'unsupported_historical_method', { recordId, eventId, method: profile.method })
    if (profile.method === 'average' && !versioned) add('review', 'legacy_average_requires_explicit_transition', { recordId, eventId })
    if (profile.method === 'rank_based' && profile.transitions.some(r => r.progression === 'carry_forward' || r.progression === 'weighted' && rounds.length > 1)) add('review', 'ordinal_round_combination', { recordId, eventId })
    if (profile.transitions.some(r => r.progression === 'carry_forward')) add('review', 'additive_carry_is_not_percentage', { recordId, eventId })
  }
  for (const event of rows('events')) {
    if (!['competition_scoring', 'pageant'].includes(event.event_type)) continue
    if (!event.official_rules_id) inspectRules(event.id, event.id, event.scoring_config, rows('competition_rounds').filter(r => r.event_id === event.id), false)
  }
  for (const rule of rows('competition_rule_versions')) {
    if (!rule.snapshot || !Array.isArray(rule.snapshot.rounds)) add('review', 'unrecognized_historical_rule_snapshot', { recordId: rule.id, eventId: rule.event_id })
    else {
      if (rule.snapshot.event?.id !== rule.event_id) add('blocker', 'frozen_rule_event_mismatch', { recordId: rule.id, eventId: rule.event_id })
      inspectRules(rule.id, rule.event_id, rule.snapshot.scoringConfig, rule.snapshot.rounds, true)
    }
  }
  const calculations = rows('competition_result_calculations')
  for (const calculation of calculations) {
    const saved = calculation.configuration_snapshot
    const config = saved?.scoringConfig ?? saved
    const method = saved?.method ?? config?.calculationMethod
    if (!method) add('review', 'historical_calculation_method_unknown', { recordId: calculation.id, eventId: calculation.event_id })
    else inspectRules(calculation.id, calculation.event_id, { ...config, calculationMethod: method }, [], Boolean(calculation.rules_version))
    if (!Array.isArray(calculation.result_snapshot)) add('review', 'unrecognized_historical_result_snapshot', { recordId: calculation.id, eventId: calculation.event_id })
    if (calculation.rules_version) for (const source of Array.isArray(calculation.source_versions) ? calculation.source_versions : []) {
      const submission = maps.competition_round_submissions.get(source.id)
      if (inspections.competition_round_submissions?.complete && (!submission || submission.event_id !== calculation.event_id || submission.rules_version !== calculation.rules_version || String(submission.version) !== String(source.version))) add('blocker', 'calculation_submission_lineage_conflict', { recordId: calculation.id, sourceId: source.id })
      // Invalidated historical sources may still explain a finalized snapshot;
      // never recalculate it merely because that source is no longer current.
    }
  }
  for (const submission of rows('competition_round_submissions')) {
    if (!Array.isArray(submission.sources) || !submission.sources.length) { add('review', 'unrecognized_submission_snapshot', { recordId: submission.id }); continue }
    const identities = submission.sources.map(s => s.contestantId)
    if (new Set(identities).size !== identities.length) add('blocker', 'duplicate_submission_entry_sources', { recordId: submission.id })
    for (const source of submission.sources) {
      const entry = maps.competition_contestants.get(source.contestantId)
      if (inspections.competition_contestants?.complete && (!entry || entry.event_id !== submission.event_id)) add('blocker', 'submission_entry_lineage_conflict', { recordId: submission.id, entryId: source.contestantId })
    }
  }
  const historicalResults = {
    total: calculations.length,
    legacy: calculations.filter(c => !c.rules_version).length,
    finalized: calculations.filter(c => c.status === 'finalized').length,
    published: calculations.filter(c => c.status === 'published').length,
    missingInputRevision: calculations.filter(c => c.rules_version && c.source_input_revision == null).length,
  }
  if (historicalResults.missingInputRevision) add('review', 'historical_calculations_without_revision', { count: historicalResults.missingInputRevision, action: 'Preserve official snapshots; only new approval operations need fresh current calculations.' })
  if (rows('competition_session_judge_scores').some(r => r.is_locked || r.locked_criteria?.length) && !rows('competition_round_submissions').length) add('review', 'locks_are_not_round_submissions')
  if (rows('competition_deductions').some(r => !r.rules_version || ['legacy', null, undefined].includes(r.decision_status))) add('review', 'legacy_deductions_require_semantic_preservation')

  if (!metadata) add('blocker', 'database_metadata_unverified', { reason: 'REST schema does not prove FK validation, trigger definitions, RLS, grants or RPC implementations. Run the PostgreSQL catalog preflight before a migration.' })
  else {
    for (const constraint of metadata.constraints ?? []) if (!constraint.validated) add('blocker', 'unvalidated_constraint', { table: constraint.table, name: constraint.name })
    const participantFK = (metadata.constraints ?? []).some(c => c.table === 'event_participants' && c.target === 'events' && c.columns?.length === 1 && c.columns[0] === 'event_id' && c.targetColumns?.length === 1 && c.targetColumns[0] === 'id' && c.validated)
    if (!participantFK) add('blocker', 'participant_event_fk_missing_098')
    const rpcOnlyTables=['competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads','competition_child_scoring_audit','competition_child_review_policies','competition_child_deduction_decisions','competition_child_deduction_reviews','competition_child_calculations','competition_child_calculation_transitions','competition_child_qualifications','competition_child_publications']
    for (const table of metadata.privateTables ?? []) if (!table.rls || table.anonAccess || table.authenticatedAccess || (!rpcOnlyTables.includes(table.table)&&!table.serviceSelect) || (rpcOnlyTables.includes(table.table)&&(table.serviceSelect||table.serviceWrite!==false))) add('blocker', 'private_table_permissions_require_review', { table: table.table })
    for (const index of metadata.indexes ?? []) if (!index.valid) add('blocker', 'invalid_index', { table: index.table, name: index.name })
    for (const trigger of metadata.triggers ?? []) if (!['O', 'A'].includes(trigger.enabled)) add('blocker', 'disabled_guard_trigger', { table: trigger.table, name: trigger.name })
    if (metadata.source === 'postgresql_catalog') {
      const requiredTriggers = {
        competition_rule_versions: ['competition_rules_immutable'],
        competition_result_calculations: ['competition_calculation_immutable', 'competition_calculation_revision', 'competition_calculation_identity'],
        competition_criterion_lock_history: ['competition_lock_history_immutable'],
        competition_session_judge_scores: ['competition_lock_history'],
        events: ['competition_event_revision'],
      }
      for (const [table, names] of Object.entries(requiredTriggers)) for (const name of names) if (schema.tables?.[table] && !(metadata.triggers ?? []).some(t => t.table === table && t.name === name)) add('blocker', 'missing_guard_trigger', { table, name })
      const requiredIndexes = ['competition_one_live_session', 'competition_current_submission', 'competition_draft_cell', 'competition_one_penalty_per_offense']
      if(schema.tables?.competition_child_publications){requiredIndexes.push('competition_child_publication_version');for(const name of ['competition_child_publication_guard','competition_child_publications_immutable'])if(!(metadata.triggers??[]).some(t=>t.table==='competition_child_publications'&&t.name===name))add('blocker','missing_guard_trigger',{table:'competition_child_publications',name});const projection=(metadata.functionDefinitions??[]).find(f=>f.name==='competition_child_public_projection');if(!projection||projection.serviceExecute||projection.anonExecute||projection.authenticatedExecute)add('blocker','private_native_helper_permissions',{name:'competition_child_public_projection'})}
      if(schema.tables?.competition_child_calculations){
        for(const [table,name] of [['competition_child_sessions','competition_child_pause_dependents'],['competition_child_deduction_decisions','competition_child_deduction_source_revision'],['competition_child_deduction_reviews','competition_child_deduction_source_revision']])if(!(metadata.triggers??[]).some(t=>t.table===table&&t.name===name))add('blocker','missing_guard_trigger',{table,name})
        for(const table of ['competition_child_review_policies','competition_child_deduction_decisions','competition_child_deduction_reviews','competition_child_calculations','competition_child_calculation_transitions','competition_child_qualifications'])for(const name of ['competition_child_official_immutable','competition_child_official_relation_guard'])if(!(metadata.triggers??[]).some(t=>t.table===table&&t.name===name))add('blocker','missing_guard_trigger',{table,name})
        for(const table of ['competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads'])if(!(metadata.triggers??[]).some(t=>t.table===table&&t.name==='competition_child_qualified_scoring_guard'))add('blocker','missing_guard_trigger',{table,name:'competition_child_qualified_scoring_guard'})
        for(const name of ['competition_child_current_sources','competition_child_qualification_state','competition_child_reviewer_authority','competition_child_live_view_v105','competition_child_live_control_v105']){const definition=(metadata.functionDefinitions??[]).find(f=>f.name===name);if(!definition||definition.serviceExecute||definition.anonExecute||definition.authenticatedExecute)add('blocker','private_native_helper_permissions',{name})}
      }
      if(schema.tables?.competition_child_sessions){
        requiredIndexes.push('competition_child_session_scope')
        for(const table of ['competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads'])if(!(metadata.triggers??[]).some(t=>t.table===table&&t.name==='competition_child_scoring_relation_guard'))add('blocker','missing_guard_trigger',{table,name:'competition_child_scoring_relation_guard'})
        for(const table of ['competition_child_submissions','competition_child_scoring_audit'])if(!(metadata.triggers??[]).some(t=>t.table===table&&t.name==='competition_child_scoring_immutable'))add('blocker','missing_guard_trigger',{table,name:'competition_child_scoring_immutable'})
      }
      if (schema.tables?.competitions) {
        requiredIndexes.push('competitions_event_name', 'competitions_one_legacy')
        for (const table of ['competitions', 'competition_entries', 'competition_legacy_contexts']) if (!(metadata.triggers ?? []).some(t => t.table === table && t.name === 'competition_child_relation_guard')) add('blocker', 'missing_guard_trigger', { table, name: 'competition_child_relation_guard' })
        for (const name of ['competitions_identity_event', 'competition_legacy_context_event', 'competition_entries_context', 'competition_entries_one_membership', 'competition_entries_number']) if (!(metadata.constraints ?? []).some(c => c.name === name && c.validated)) add('blocker', 'missing_child_relation_constraint', { name })
      }
      if(schema.tables?.competition_child_configurations){
        requiredIndexes.push('competition_child_assignment_context')
        for(const table of ['competition_entries','competition_child_configurations','competition_child_rounds','competition_child_criteria','competition_child_minors','competition_child_judge_assignments'])if(!(metadata.triggers??[]).some(t=>t.table===table&&t.name==='competition_native_source_guard'))add('blocker','missing_guard_trigger',{table,name:'competition_native_source_guard'})
        for(const [table,name] of [['competitions','competition_native_identity_guard'],['users','competition_native_account_dependency'],['event_participants','competition_native_enrollment_dependency'],['competition_contestants','competition_native_entry_dependency'],['competition_child_rule_versions','competition_child_rules_immutable']])if(!(metadata.triggers??[]).some(t=>t.table===table&&t.name===name))add('blocker','missing_guard_trigger',{table,name})
      }
      for (const name of requiredIndexes) if (!(metadata.indexes ?? []).some(i => i.name === name && i.valid && i.unique)) add('blocker', 'missing_unique_context_index', { name })
      const signatures = {
        competition_scoring_write: 'uuid, uuid, jsonb, text, jsonb',
        competition_operational_action: 'uuid, uuid, uuid, text, jsonb',
        competition_result_transition: 'uuid, uuid, uuid, text, text, text',
        competition_confirm_advancement: 'uuid, uuid, uuid, uuid, uuid, uuid[], text',
      }
      if(schema.functions?.includes('competition_child_judge_navigation'))Object.assign(signatures,{competition_child_judge_navigation:'uuid, uuid, boolean',competition_remove_native_draft_entry:'uuid, uuid, uuid, uuid, bigint, bigint'})
      if(schema.tables?.competition_child_publications)Object.assign(signatures,{competition_child_publication_action:'uuid, uuid, uuid, uuid, text, jsonb',competition_child_public_results:'uuid, uuid, uuid',competition_child_owned_results:'uuid, uuid, uuid, uuid',competition_child_export_sources:'uuid, uuid, uuid, uuid, text, text, uuid, uuid'})
      if(schema.tables?.competition_child_sessions)Object.assign(signatures,{
        competition_child_scoring_choices:'uuid, uuid, boolean',competition_child_live_view:'uuid, uuid, uuid, uuid, boolean',competition_child_live_control:'uuid, uuid, uuid, uuid, text, jsonb',competition_child_score_write:'uuid, uuid, uuid, uuid, text, jsonb',
      })
      if(schema.tables?.competition_child_calculations)Object.assign(signatures,{
        competition_child_tabulation_snapshot:'uuid, uuid, uuid, uuid, boolean',competition_child_appoint_reviewer:'uuid, uuid, uuid, uuid',competition_child_official_calculate:'uuid, uuid, uuid, uuid, text, jsonb, jsonb',competition_child_official_transition:'uuid, uuid, uuid, uuid, text, text',competition_child_deduction_action:'uuid, uuid, uuid, uuid, text, jsonb',competition_child_confirm_qualification:'uuid, uuid, uuid, uuid, uuid, text, jsonb, text, boolean',competition_child_official_notice:'uuid, uuid, uuid, uuid',competition_child_reviewer_choices:'uuid, uuid',
      })
      if (schema.tables?.competitions) Object.assign(signatures, {
        competition_create_child: 'uuid, uuid, uuid, text, text',
        competition_add_entry: 'uuid, uuid, uuid, uuid, integer',
        competition_map_legacy_event: 'uuid, uuid',
      })
      if(schema.tables?.competition_child_configurations)Object.assign(signatures,{
        competition_save_native_configuration:'uuid, uuid, uuid, bigint, jsonb',
        competition_assign_native_judge:'uuid, uuid, uuid, uuid, uuid, boolean',
        competition_freeze_native_rules:'uuid, uuid, uuid, bigint, bigint',
        competition_native_judge_context:'uuid, uuid, uuid, uuid',
        competition_native_foundation:'uuid, uuid, uuid',
      })
      for (const [name, argumentTypes] of Object.entries(signatures)) {
        const implementation = (metadata.functionDefinitions ?? []).find(f => f.name === name && f.argumentTypes === argumentTypes)
        if (!implementation) add('blocker', 'rpc_signature_unverified', { name, argumentTypes })
        else if (implementation.anonExecute || implementation.authenticatedExecute || !implementation.serviceExecute) add('blocker', 'rpc_execution_permissions_require_review', { name })
      }
    }
  }
  const inventory = Object.fromEntries(COMPETITION_TABLES.filter(table => schema.tables?.[table]).map(table => [table, {
    count: inspections[table]?.count ?? rows(table).length,
    complete: inspections[table]?.complete === true,
    // PostgreSQL supplies a digest of lossless row text, avoiding JSON numeric
    // coercion. REST hashes describe the observed JSON transport representation.
    fingerprint: inspections[table]?.complete ? inspections[table].fingerprint ?? fingerprintRows(rows(table)) : null,
  }]))
  return {
    format: 'votrix-competition-preflight-v1', readOnly: true,
    schema, metadata, capabilities, inventory, historicalResults, ruleProfiles, findings,
    blockers: findings.filter(f => f.severity === 'blocker').length,
    reviewItems: findings.filter(f => f.severity === 'review').length,
    migrationApproved: false,
    preservation: 'No scores, locks, submissions, deductions, rules or result snapshots are changed or recalculated.',
  }
}

export function compareHistoricalInventory(before, after) {
  const changes = []
  for (const table of new Set([...Object.keys(before.inventory ?? {}), ...Object.keys(after.inventory ?? {})])) {
    const old = before.inventory?.[table], current = after.inventory?.[table]
    if (!old?.complete || !current?.complete) changes.push({ table, reason: 'incomplete_or_missing_inventory' })
    else if (old.count !== current.count || old.fingerprint !== current.fingerprint) changes.push({ table, reason: 'stored_records_changed' })
  }
  return { comparable: changes.every(c => c.reason !== 'incomplete_or_missing_inventory'), unchanged: !changes.length, changes, note: 'Observations alone do not prove migration safety; normal live writes can change fingerprints.' }
}
