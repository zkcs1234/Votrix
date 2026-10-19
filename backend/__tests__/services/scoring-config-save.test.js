import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ event: {}, calls: [], current: {}, saved: null, rejectWrite: false }))
vi.mock('../../src/services/event.service.js', () => ({ assertOrganizerOwnsEvent: async () => mocks.event, getEventById: vi.fn() }))
vi.mock('../../src/services/competition-division.service.js', () => ({ listDivisions: async () => [] }))
vi.mock('../../src/foundation/activity.js', () => ({ recordEventActivity: vi.fn() }))
vi.mock('../../src/foundation/db.js', () => ({ db: () => ({ from: table => {
  let write = null
  const data = () => table === 'events' ? { id: 'e', status: 'draft', scoring_config: mocks.current } : []
  const q = { select: () => q, eq: (...args) => { mocks.calls.push({ table, method: 'eq', args }); return q }, is: (...args) => { mocks.calls.push({ table, method: 'is', args }); return q }, in: () => q, order: () => q, range: () => q, update: value => { write = value; return q }, single: async () => ({ data: data(), error: null }), maybeSingle: async () => { if (!write || mocks.rejectWrite) return { data: null, error: null }; mocks.saved = write.scoring_config; return { data: write, error: null } }, then: resolve => resolve({ data: Array.isArray(data()) ? data() : [data()], count: Array.isArray(data()) ? data().length : 1, error: null }) }
  return q
} }) }))
import { setScoringConfig } from '../../src/services/competition.service.js'
beforeEach(() => {
  mocks.calls = []; mocks.saved = null; mocks.rejectWrite = false
  mocks.event = { id: 'e', status: 'draft', event_type: 'competition_scoring', official_rules_id: null }
  mocks.current = { calculationMethod: 'weighted_average', tiePolicy: 'shared', decimalPlaces: 2, confirmed: true, independentApproval: true, verifierId: null, customMax: 100, customMin: 1 }
})
test('a partial setting change clears a stale confirmation and preserves unrelated settings', async () => {
  const result = await setScoringConfig('e', 'owner', { calculationMethod: 'sum' })
  expect(result).toMatchObject({ calculationMethod: 'sum', confirmed: false, customMax: 100, customMin: 1 })
})
test('explicit confirmation permits assigning the reviewer later during setup', async () => {
  const result = await setScoringConfig('e', 'owner', { calculationMethod: 'sum', confirmed: true, verifierId: null })
  expect(result).toMatchObject({ confirmed: true, verifierId: null })
})
test('undecided is always stored as an unconfirmed draft', async () => {
  const result = await setScoringConfig('e', 'owner', { calculationMethod: 'undecided', confirmed: true })
  expect(result.confirmed).toBe(false)
})
test('incomplete manual or incompatible rank rules cannot be confirmed through the save API', async () => {
  await expect(setScoringConfig('e', 'owner', { calculationMethod: 'manual', manualBasis: '', confirmed: true })).rejects.toMatchObject({ statusCode: 400 })
  await expect(setScoringConfig('e', 'owner', { calculationMethod: 'rank_based', tiePolicy: 'highest_criterion', confirmed: true })).rejects.toMatchObject({ statusCode: 400 })
  expect(mocks.saved).toBeNull()
})
test('published rules cannot be edited even if an event reports draft status', async () => {
  mocks.event.official_rules_id = 'published'
  await expect(setScoringConfig('e', 'owner', { calculationMethod: 'sum' })).rejects.toMatchObject({ statusCode: 409 })
  expect(mocks.saved).toBeNull()
})
test('publication racing the save cannot update the event configuration', async () => {
  mocks.rejectWrite = true
  await expect(setScoringConfig('e', 'owner', { confirmed: false })).rejects.toMatchObject({ statusCode: 409 })
  expect(mocks.calls).toContainEqual({ table: 'events', method: 'eq', args: ['status', 'draft'] })
  expect(mocks.calls).toContainEqual({ table: 'events', method: 'is', args: ['official_rules_id', null] })
})
