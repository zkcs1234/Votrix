import { describe, expect, test } from 'vitest'
import { analyzeCompetitionPreflight, CAPABILITY_REQUIREMENTS, describeHistoricalRules, fingerprintRows, compareHistoricalInventory } from '../../src/modules/competition-legacy-preflight.js'
import { calculateOfficial } from '../../../shared/competition-calculation.js'
import { computeRankings } from '../../src/modules/scoring-engine.js'
import { applyDeductionsToRankings } from '../../src/modules/tabulation.js'

function fixture() {
  const tables = {}
  for (const requirement of CAPABILITY_REQUIREMENTS) for (const [table, columns] of Object.entries(requirement.columns ?? {})) tables[table] = { columns: [...new Set([...(tables[table]?.columns ?? []), ...columns])] }
  const records = Object.fromEntries(Object.keys(tables).map(t => [t, []]))
  records.events = [{ id: 'e', event_type: 'competition_scoring', scoring_config: { calculationMethod: 'weighted_average' } }]
  const inspections = Object.fromEntries(Object.keys(tables).map(t => [t, { complete: true, count: records[t].length }]))
  return { schema: { tables, functions: [...new Set(CAPABILITY_REQUIREMENTS.flatMap(r => [...r.functions ?? [], ...r.catalogFunctions ?? []]))] }, records, inspections, metadata: { constraints: [{ table: 'event_participants', target: 'events', columns: ['event_id'], targetColumns: ['id'], validated: true }], privateTables: [] } }
}

describe('read-only competition compatibility inventory', () => {
  test('does not mutate, promote locks, fabricate submissions or recalculate snapshots', () => {
    const input = fixture()
    input.records.competition_result_calculations = [{ id: 'result', event_id: 'e', status: 'published', result_snapshot: [{ rank: 1, finalScore: -2 }], configuration_snapshot: { method: 'rank_based' } }]
    input.records.competition_session_judge_scores = [{ id: 'locked', event_id: 'e', is_locked: true, scores: { c: 0 } }]
    const original = structuredClone(input)
    const report = analyzeCompetitionPreflight(input)
    expect(input).toEqual(original)
    expect(report.historicalResults).toMatchObject({ total: 1, legacy: 1, published: 1 })
    expect(report.findings.some(f => f.code === 'locks_are_not_round_submissions')).toBe(true)
    expect(report.migrationApproved).toBe(false)
    expect(JSON.stringify(report)).not.toContain('result_snapshot')
    expect(JSON.stringify(report)).not.toContain('"scores":{')
  })
  test('absence of capabilities and unknown metadata blocks rather than claiming an empty modern database', () => {
    const report = analyzeCompetitionPreflight()
    expect(report.blockers).toBeGreaterThan(0)
    expect(report.findings.some(f => f.code === 'database_metadata_unverified')).toBe(true)
    expect(report.capabilities.every(c => !c.migrationExecutionVerified)).toBe(true)
  })
  test('missing and capped inventory is distinct from zero rows', () => {
    const input = fixture()
    delete input.inspections.competition_scores
    input.inspections.competition_round_submissions = { count: 50000, complete: false, reason: 'limit' }
    const report = analyzeCompetitionPreflight(input)
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'uninspected_table', table: 'competition_scores' }), expect.objectContaining({ code: 'incomplete_inventory' })]))
    expect(report.inventory.competition_round_submissions.fingerprint).toBeNull()
  })
  test('cross-event links and wrong minor parents are reported without moving rows', () => {
    const input = fixture()
    input.records.events.push({ id: 'other', event_type: 'competition_scoring' })
    input.records.competition_rounds = [{ id: 'r', event_id: 'e' }]
    input.records.competition_criteria = [{ id: 'c', event_id: 'other' }, { id: 'same', event_id: 'e' }]
    input.records.competition_minor_criteria = [{ id: 'm', event_id: 'e', criteria_id: 'same' }]
    input.records.competition_round_criteria = [{ round_id: 'r', criteria_id: 'c' }]
    input.records.competition_scores = [{ id: 's', event_id: 'e', criteria_id: 'c', minor_criteria_id: 'm' }]
    const report = analyzeCompetitionPreflight(input)
    const conflicts = report.findings.find(f => f.code === 'historical_relation_conflicts')
    expect(conflicts.examples).toEqual(expect.arrayContaining([expect.objectContaining({ issue: 'cross_event' }), expect.objectContaining({ issue: 'wrong_major_criterion' })]))
  })
  test('NULL-round duplicates, multiple live sessions and duplicate offense references block review', () => {
    const input = fixture()
    input.records.competition_scores = ['a', 'b'].map(id => ({ id, judge_id: 'j', contestant_id: 'entry', criteria_id: 'c', round_id: null }))
    input.records.competition_sessions = [{ id: 'a', event_id: 'e', status: 'active' }, { id: 'b', event_id: 'e', status: 'paused' }]
    input.records.competition_deductions = ['a', 'b'].map(id => ({ id, event_id: 'e', contestant_id: 'entry', offense_key: 'same', decision_status: 'approved' }))
    const codes = analyzeCompetitionPreflight(input).findings.map(f => f.code)
    expect(codes).toEqual(expect.arrayContaining(['ambiguous_score_cells', 'multiple_live_sessions', 'duplicate_offense_references']))
  })
  test('invalidated sheets are not counted as duplicate current submissions', () => {
    const input = fixture()
    input.records.competition_round_submissions = [{ id: 'a', session_id: 'session', judge_id: 'j', status: 'invalidated' }, { id: 'b', session_id: 'session', judge_id: 'j', status: 'submitted' }]
    expect(analyzeCompetitionPreflight(input).findings.some(f => f.code === 'duplicate_current_submissions')).toBe(false)
  })
  test('legacy average alias is preserved and flagged for an explicit transition', () => {
    expect(describeHistoricalRules({ calculationMethod: 'average' })).toMatchObject({ method: 'average', supported: true, engine: 'legacy' })
    expect(describeHistoricalRules({ calculationMethod: 'average' }, [], { versioned: true }).supported).toBe(false)
    const input = fixture(); input.records.events[0].scoring_config.calculationMethod = 'average'
    expect(analyzeCompetitionPreflight(input).findings.some(f => f.code === 'legacy_average_requires_explicit_transition')).toBe(true)
  })
  test('legacy negative rank and versioned positive placement representations stay distinct', () => {
    const legacy = describeHistoricalRules({ calculationMethod: 'rank_based' })
    const modern = describeHistoricalRules({ calculationMethod: 'rank_based' }, [], { versioned: true })
    expect(legacy.rankBasis).toContain('negative finalScore')
    expect(modern.rankBasis).toContain('positive placement')
  })
  test('ordinal percentage combinations and additive carry are review items, never repaired', () => {
    const input = fixture()
    input.records.events[0].scoring_config.calculationMethod = 'rank_based'
    input.records.competition_rounds = [{ id: 'pre', event_id: 'e', weight: 20, workflow: { progression: 'weighted' } }, { id: 'final', event_id: 'e', weight: 80, workflow: { progression: 'carry_forward' } }]
    expect(analyzeCompetitionPreflight(input).findings.map(f => f.code)).toEqual(expect.arrayContaining(['ordinal_round_combination', 'additive_carry_is_not_percentage']))
    expect(input.records.competition_rounds[1].workflow.progression).toBe('carry_forward')
  })
  test('older finalized records without input revisions remain historical snapshots', () => {
    const input = fixture()
    input.records.competition_result_calculations = [{ id: 'c', event_id: 'e', rules_version: 'v', status: 'finalized', source_input_revision: null, result_snapshot: [{ finalScore: 85 }] }]
    const report = analyzeCompetitionPreflight(input)
    expect(report.historicalResults.missingInputRevision).toBe(1)
    expect(report.findings.find(f => f.code === 'historical_calculations_without_revision').severity).toBe('review')
    expect(input.records.competition_result_calculations[0].source_input_revision).toBeNull()
  })
  test('stored calculation configuration is inspected independently of the current event rules', () => {
    const input = fixture()
    input.records.competition_result_calculations = [{ id: 'old', event_id: 'e', status: 'finalized', configuration_snapshot: { method: 'average' }, result_snapshot: [{ rank: 1, finalScore: 87 }] }]
    const report = analyzeCompetitionPreflight(input)
    expect(report.ruleProfiles.find(p => p.recordId === 'old')).toMatchObject({ engine: 'legacy', method: 'average' })
    expect(input.records.competition_result_calculations[0].result_snapshot[0].finalScore).toBe(87)
  })
  test('frozen rule and submission lineage mismatches block without invalidating historical records', () => {
    const input = fixture()
    input.records.competition_rule_versions = [{ id: 'v', event_id: 'e', snapshot: { event: { id: 'foreign' }, rounds: [], scoringConfig: { calculationMethod: 'sum' } } }]
    input.records.competition_round_submissions = [{ id: 's', event_id: 'e', rules_version: 'v', version: 2, status: 'invalidated', sources: [{ contestantId: 'foreign-entry', scores: { c: 90 } }] }]
    input.records.competition_result_calculations = [{ id: 'c', event_id: 'e', rules_version: 'v', status: 'published', source_versions: [{ id: 's', version: 1 }], result_snapshot: [] }]
    const codes = analyzeCompetitionPreflight(input).findings.map(f => f.code)
    expect(codes).toEqual(expect.arrayContaining(['frozen_rule_event_mismatch', 'calculation_submission_lineage_conflict', 'submission_entry_lineage_conflict']))
    expect(input.records.competition_result_calculations[0].status).toBe('published')
  })
  test('unvalidated FK and private-table exposure block migration readiness', () => {
    const input = fixture()
    input.metadata.constraints[0].validated = false
    input.metadata.privateTables = [{ table: 'competition_scores', rls: true, anonAccess: true, authenticatedAccess: false, serviceSelect: true }]
    expect(analyzeCompetitionPreflight(input).findings.map(f => f.code)).toEqual(expect.arrayContaining(['unvalidated_constraint', 'participant_event_fk_missing_098', 'private_table_permissions_require_review']))
  })
  test('REST cannot establish whether private trigger functions exist', () => {
    const input = fixture(); input.metadata = null
    input.schema.functions = input.schema.functions.filter(n => !['competition_archive_lock', 'competition_snapshot_immutable', 'competition_guard_calculation_revision'].includes(n))
    const report = analyzeCompetitionPreflight(input)
    expect(report.findings.filter(f => f.code === 'missing_capability')).toHaveLength(0)
    expect(report.capabilities.find(c => c.name === 'source_history_093').unverified).toHaveLength(2)
    expect(report.findings.some(f => f.code === 'database_metadata_unverified')).toBe(true)
  })
  test('missing/disabled guard triggers and invalid indexes are not treated as installed protection', () => {
    const input = fixture()
    input.metadata = { ...input.metadata, source: 'postgresql_catalog', triggers: [{ table: 'competition_rule_versions', name: 'competition_rules_immutable', enabled: 'D' }], indexes: [{ table: 'competition_sessions', name: 'competition_one_live_session', unique: true, valid: false }] }
    const codes = analyzeCompetitionPreflight(input).findings.map(f => f.code)
    expect(codes).toEqual(expect.arrayContaining(['disabled_guard_trigger', 'missing_guard_trigger', 'invalid_index', 'missing_unique_context_index', 'rpc_signature_unverified']))
  })
  test('fingerprints ignore table retrieval order but detect exact raw values, locks and ranking order', () => {
    const records = [{ id: 'a', score: 0, locked: true }, { id: 'b', result_snapshot: [{ rank: 1 }, { rank: 2 }] }]
    expect(fingerprintRows(records)).toBe(fingerprintRows([...records].reverse()))
    expect(fingerprintRows(records)).not.toBe(fingerprintRows([{ ...records[0], score: null }, records[1]]))
    expect(fingerprintRows(records)).not.toBe(fingerprintRows([records[0], { ...records[1], result_snapshot: [...records[1].result_snapshot].reverse() }]))
  })
  test('baseline comparison cannot claim preservation with missing or incomplete tables', () => {
    const before = { inventory: { scores: { complete: true, count: 1, fingerprint: 'a' } } }
    expect(compareHistoricalInventory(before, before)).toMatchObject({ unchanged: true, comparable: true })
    expect(compareHistoricalInventory(before, { inventory: {} })).toMatchObject({ unchanged: false, comparable: false })
    expect(compareHistoricalInventory(before, { inventory: { scores: { complete: true, count: 1, fingerprint: 'b' } } })).toMatchObject({ unchanged: false, comparable: true })
  })
})

describe('characterize authoritative formulas without changing either engine', () => {
  const rules = { id: 'v', event: { id: 'e' }, scoringConfig: { calculationMethod: 'weighted_average', decimalPlaces: 2 }, rounds: [], categories: [], contestants: [{ id: 'a', name: 'A' }], criteria: [{ id: 'c', name: 'Quality', percentage: 100, minScore: 0, maxScore: 100, minorCriteria: [] }], judges: [1, 2, 3, 4].map(n => ({ judgeId: `j${n}`, role: 'judge', isActive: true })) }
  const sources = [90, 86, 92, 78].map((score, i) => ({ id: `s${i}`, rules_version: 'v', judge_id: `j${i + 1}`, round_id: null, status: 'submitted', sources: [{ contestantId: 'a', scores: { c: score } }] }))
  test.each([['weighted_average', 86.5], ['sum', 346], ['highest_score', 92], ['lowest_removal', 88], ['rank_based', 4]])('%s preserves whole-judge-total aggregation and one-time deduction units', (method, expected) => {
    const model = { ...rules, scoringConfig: { calculationMethod: method, decimalPlaces: 2, dropLowest: 1, dropHighest: 1 } }
    const result = calculateOfficial(model, sources)
    expect(result.ready).toBe(true); expect(result.results[0].finalScore).toBe(expected)
    const adjusted = calculateOfficial(model, sources, { deductions: [{ contestant_id: 'a', round_id: null, decision_status: 'approved', amount: 5 }] })
    expect(adjusted.results[0].finalScore).toBe(method === 'rank_based' ? expected + 5 : expected - 5)
  })
  test('manual results stay on the explicit decision path; the numeric engine does not invent a result', () => {
    expect(() => calculateOfficial({ ...rules, scoringConfig: { calculationMethod: 'manual' } }, sources)).toThrow('Numeric calculation requires confirmed numeric rules')
  })
  test('legacy ranking signs and placement deductions stay unchanged', () => {
    const result = computeRankings({ scores: [{ contestantId: 'a', judgeId: 'j', criteriaId: 'c', score: 90 }, { contestantId: 'b', judgeId: 'j', criteriaId: 'c', score: 80 }], contestants: [{ id: 'a' }, { id: 'b' }], criteria: [{ id: 'c', percentage: 100 }], config: { calculationMethod: 'rank_based' } })
    expect(result.rankings.map(r => [r.contestantId, r.rank, r.finalScore, r.placementTotal])).toEqual([['a', 1, -1, 1], ['b', 2, -2, 2]])
    const adjusted = applyDeductionsToRankings(result.rankings, [{ contestantId: 'a', amount: 2 }])
    expect(adjusted.map(r => [r.contestantId, r.finalScore, r.rank])).toEqual([['b', 2, 1], ['a', 3, 2]])
  })
})
