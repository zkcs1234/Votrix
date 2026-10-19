import { beforeEach, expect, test, vi } from 'vitest'
import { criteriaSource } from '../../../shared/competition-criteria-readiness.js'
const mocks = vi.hoisted(() => ({ foundation: vi.fn(), rpc: vi.fn(), owner: vi.fn(), from: vi.fn() }))
vi.mock('../../src/services/competition.service.js', () => ({ getCompetitionFoundation: mocks.foundation }))
vi.mock('../../src/services/event.service.js', () => ({ assertOrganizerOwnsEvent: mocks.owner, getEventById: vi.fn() }))
vi.mock('../../src/foundation/db.js', () => ({ db: () => ({ rpc: mocks.rpc, from: mocks.from }) }))
vi.mock('../../src/websocket/ws-emitter.js', () => ({ emitToEvent: vi.fn(), emitToEventOrganizer: vi.fn() }))
import { freezeRules, organizerAction } from '../../src/services/competition-workflow.service.js'
let foundation
beforeEach(() => {
  vi.clearAllMocks()
  foundation = { event: { id: 'e' }, scoringConfig: { confirmed: true, calculationMethod: 'weighted_average', tiePolicy: 'shared', decimalPlaces: 2, independentApproval: false }, rounds: [], criteria: [{ id: 'c', name: 'Quality', percentage: 100, minScore: 1, maxScore: 100, minorCriteria: [] }], contestants: [{ id: 'a' }], categories: [], divisions: [], judges: [{ id: 'p', judgeId: 'j', role: 'judge', isActive: true }], assignments: [] }
  mocks.owner.mockResolvedValue({ id: 'e', status: 'draft', event_type: 'competition_scoring', competition_setup_revision: 1 })
  mocks.foundation.mockImplementation(async () => structuredClone(foundation))
  mocks.rpc.mockImplementation(async name => ({ error: null, data: name === 'competition_criteria_source' ? criteriaSource(foundation) : { status: 'scheduled' } }))
  mocks.from.mockImplementation(table => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, range:()=>q, maybeSingle: async () => ({ error: null, data: table === 'competition_rule_versions' ? { id: 'v', version: 1, snapshot: { ...foundation, judges: [] } } : null }), then: resolve => resolve({ error: null, data: [] }) }
    return q
  })
})
test('publication rejects incomplete percentages and invalid inputs before a publishing RPC', async () => {
  foundation.criteria[0].percentage = 60
  await expect(freezeRules('e', 'owner', { acknowledged: true })).rejects.toMatchObject({ statusCode: 400, details: { criteriaReadiness: { allReady: false } } })
  foundation.criteria[0].percentage = 100; foundation.criteria[0].minorCriteria = [{ id: 'm', scoreType: 'custom_range', customMin: 10, customMax: 0 }]
  await expect(freezeRules('e', 'owner', { acknowledged: true })).rejects.toThrow('valid score range')
  expect(mocks.rpc).not.toHaveBeenCalled()
})
test('deferred or inactive reviewer assignment is rejected at publication', async () => {
  foundation.scoringConfig.independentApproval = true
  await expect(freezeRules('e', 'owner', { acknowledged: true })).rejects.toMatchObject({ statusCode: 400, details: { scoringRulesReadiness: { readyForPublication: false } } })
  foundation.scoringConfig.verifierId = 'reviewer'
  foundation.judges.push({ id: 'reviewer-enrollment', judgeId: 'reviewer', role: 'score_reviewer', isActive: true, accountStatus: 'inactive' })
  await expect(freezeRules('e', 'owner', { acknowledged: true })).rejects.toMatchObject({ statusCode: 400 })
  expect(mocks.rpc.mock.calls.some(([name]) => name === 'competition_publish_rules')).toBe(false)
})
test('publication uses validated saved sources and excludes disabled minors', async () => {
  foundation.criteria[0].minorCriteria = [{ id: 'm', name: 'Pitch', scoreType: 'range_1_10', isActive: true }, { id: 'off', name: 'Disabled', scoreType: 'decimal', isActive: false }]
  await freezeRules('e', 'owner', { acknowledged: true })
  const call = mocks.rpc.mock.calls.find(([name]) => name === 'competition_publish_rules')[1]
  expect(call.p_snapshot.criteria[0].minorCriteria).toEqual([expect.objectContaining({ id: 'm', minScore: 1, maxScore: 10 })])
  expect(call.p_snapshot.criteriaSource.minors).toHaveLength(2)
})
test('inactive linked parents remain in source history but do not break frozen scoring scopes', async () => {
  foundation.criteria.push({ id: 'disabled', name: 'Disabled', percentage: 40, is_active: false, minorCriteria: [] })
  foundation.rounds = [{ id: 'r', name: 'Final', purpose: 'final', progression: 'back_to_zero', displayOrder: 0, criteriaIds: ['c', 'disabled'], contestantIds: ['a'] }]
  await freezeRules('e', 'owner', { acknowledged: true })
  const snapshot = mocks.rpc.mock.calls.find(([name]) => name === 'competition_publish_rules')[1].p_snapshot
  expect(snapshot.rounds[0].criteriaIds).toEqual(['c'])
  expect(snapshot.criteriaSource.rounds[0].criteriaIds).toEqual(['c', 'disabled'])
})
test('concurrent source changes during validation reject publication', async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: criteriaSource({ ...foundation, criteria: [] }) })
  await expect(freezeRules('e', 'owner', { acknowledged: true })).rejects.toMatchObject({ statusCode: 409 })
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['competition_criteria_source'])
})
test('database source conflict and unapplied migration fail closed', async () => {
  mocks.rpc.mockImplementation(async name => name === 'competition_criteria_source' ? { data: criteriaSource(foundation) } : { error: { message: 'CRITERIA_SETUP_CHANGED_REFRESH' } })
  await expect(freezeRules('e', 'owner', { acknowledged: true })).rejects.toMatchObject({ statusCode: 409 })
  mocks.rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'missing function' } })
  await expect(freezeRules('e', 'owner', { acknowledged: true })).rejects.toMatchObject({ statusCode: 503 })
})
test('official session start rejects a malformed frozen criteria scope', async () => {
  foundation.criteria[0].percentage = 80
  await expect(organizerAction('e', 'owner', 'start')).rejects.toMatchObject({ statusCode: 400 })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
test('official start accepts valid frozen criteria and reaches the atomic operation', async () => {
  await organizerAction('e', 'owner', 'start')
  expect(mocks.rpc).toHaveBeenCalledWith('competition_operational_action', expect.objectContaining({ p_action: 'start' }))
})

test('a protected Final publishes without ordinary Final memberships, using potential qualified entrants for panel checks', async () => {
  foundation.rounds = [{id:'pre',name:'Preliminary',displayOrder:0,purpose:'qualification',advancementType:'top_n',advancementValue:5,criteriaIds:['c'],contestantIds:['a']},
    {id:'final',name:'Final',displayOrder:1,purpose:'final',progression:'back_to_zero',criteriaIds:['c'],contestantIds:[]}]
  await freezeRules('e','owner',{acknowledged:true})
  const snapshot=mocks.rpc.mock.calls.find(([name])=>name==='competition_publish_rules')[1].p_snapshot
  expect(snapshot.rounds[1].contestantIds).toEqual([])
  expect(snapshot.registrationSource.rounds.find(r=>r.id==='final').contestantIds).toEqual([])
})
test('invalid cutoff values and independent special-award destinations cannot become published progression rules',async()=>{
 foundation.rounds=[{id:'pre',name:'Preliminary',displayOrder:0,purpose:'qualification',advancementType:'top_n',advancementValue:0,criteriaIds:['c'],contestantIds:['a']},{id:'final',name:'Final',displayOrder:1,purpose:'final',progression:'back_to_zero',criteriaIds:['c'],contestantIds:[]}]
 await expect(freezeRules('e','owner',{acknowledged:true})).rejects.toThrow('Top N')
 foundation.rounds[0].advancementValue=1;foundation.rounds.push({id:'award',name:'Award',displayOrder:2,purpose:'special',criteriaIds:['c'],contestantIds:['a']});foundation.rounds[0].nextRoundId='award'
 await expect(freezeRules('e','owner',{acknowledged:true})).rejects.toThrow('Special awards')
 expect(mocks.rpc.mock.calls.some(([name])=>name==='competition_publish_rules')).toBe(false)
})
