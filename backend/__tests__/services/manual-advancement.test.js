import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ calculation: null, rpc: vi.fn(), manualSelection:false }))
vi.mock('../../src/services/event.service.js', () => ({ assertOrganizerOwnsEvent: async () => ({ id: 'e', status: 'active', competition_input_revision: 1 }), getEventById: vi.fn() }))
vi.mock('../../src/websocket/ws-emitter.js', () => ({ emitToEvent: vi.fn(), emitToEventOrganizer: vi.fn() }))
vi.mock('../../src/foundation/db.js', () => ({ db: () => ({ rpc: mocks.rpc, from: table => {
  const snapshot = { event: { id: 'e' }, scoringConfig: { calculationMethod: 'manual' }, rounds: [{ id: 'r', name: 'Preliminary', displayOrder: 0, criteriaIds: [], contestantIds: ['a', 'b', 'c'], advancementType: mocks.manualSelection?'manual':'top_n', advancementValue: 2 }, { id: 'next', name: 'Final', displayOrder: 1, criteriaIds: [], contestantIds: [] }], criteria: [], contestants: ['a', 'b', 'c'].map(id => ({ id, name: id })), judges: [] }
  const single = () => ({ error: null, data: table === 'competition_rule_versions' ? { id: 'v', version: 1, snapshot } : table === 'competition_result_calculations' ? mocks.calculation : { id: 's', current_round_id: 'r', rules_version: 'v' } })
  const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, range: () => q, maybeSingle: async () => single(), then: resolve => resolve({ error: null, data: [], count: 0 }) }
  return q
} }) }))
import { tabulationData, advancementData, organizerAction } from '../../src/services/competition-workflow.service.js'
beforeEach(async () => {
  vi.clearAllMocks(); mocks.calculation = null; mocks.manualSelection=false
  const state = await tabulationData('e', 'owner', { roundId: 'r' })
  mocks.calculation = { id: 'calc', rules_version: 'v', round_id: 'r', status: 'under_verification', verified_at: '2026-10-12', source_digest: state.sourceDigest, source_input_revision: 1, result_snapshot: [{ contestantId: 'a', rank: 1, manual: true }, { contestantId: 'b', rank: 2, manual: true }, { contestantId: 'c', rank: 2, manual: true }] }
  mocks.rpc.mockResolvedValue({ data: { success: true }, error: null })
})
test('manual advancement uses existing verified placements and includes the cutoff tie', async () => {
  const result = await advancementData('e', 'owner', 'r', 'calc')
  expect(result.ready).toBe(true)
  expect(result.results.map(r => r.rank)).toEqual([1, 2, 2])
  await organizerAction('e', 'owner', 'advancement', { roundId: 'r', calculationId: 'calc', reason: 'Confirmed manual placements' })
  expect(mocks.rpc).toHaveBeenCalledWith('competition_confirm_advancement', expect.objectContaining({ p_calculation: 'calc', p_next: 'next', p_qualifiers: ['a', 'b', 'c'] }))
})
test('unverified manual placements cannot advance', async () => {
  mocks.calculation.verified_at = null; mocks.calculation.status = 'ready_for_verification'
  await expect(organizerAction('e', 'owner', 'advancement', { roundId: 'r', calculationId: 'calc' })).rejects.toMatchObject({ statusCode: 409 })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
test('stale manual calculation sources cannot advance', async () => {
  mocks.calculation.source_digest = 'stale'
  await expect(organizerAction('e', 'owner', 'advancement', { roundId: 'r', calculationId: 'calc' })).rejects.toMatchObject({ statusCode: 409 })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
test('automatic Top N forbids manual exceptions that remove a cutoff tie',async()=>{
  await expect(organizerAction('e','owner','advancement',{roundId:'r',calculationId:'calc',reason:'Exception',overrides:{remove:['c']}})).rejects.toMatchObject({statusCode:403})
  expect(mocks.rpc).not.toHaveBeenCalled()
})
test('published manual selection permits a reasoned selection from independently verified manual results',async()=>{
  mocks.manualSelection=true
  await organizerAction('e','owner','advancement',{roundId:'r',calculationId:'calc',reason:'Approved seeding procedure',overrides:{add:['b']}})
  expect(mocks.rpc).toHaveBeenCalledWith('competition_confirm_advancement',expect.objectContaining({p_qualifiers:['b'],p_reason:'Approved seeding procedure'}))
})
