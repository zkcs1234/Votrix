import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ tables: {}, calls: [], failLinks: false, failHistory: false, rpc: vi.fn() }))
vi.mock('../../src/services/event.service.js', () => ({ assertOrganizerOwnsEvent: async () => ({ event_type: 'competition_scoring' }), getEventById: vi.fn() }))
vi.mock('../../src/services/competition-division.service.js', () => ({ listDivisions: async () => [] }))
vi.mock('../../src/foundation/db.js', () => ({ db: () => ({ rpc: mocks.rpc, from: table => {
  let offset = 0, paged = false
  const result = () => ({ error: mocks.failLinks && table === 'competition_round_criteria' ? { message: 'membership read failed' } : mocks.failHistory && table === 'competition_eligibility_decisions' ? { message: 'eligibility read failed' } : null, data: paged ? (mocks.tables[table] ?? []).slice(offset, offset + 1) : mocks.tables[table] ?? [], count: mocks.tables[table]?.length ?? 0 })
  const q = { select: (...args) => { mocks.calls.push({ table, method: 'select', args }); return q }, eq: (...args) => { mocks.calls.push({ table, method: 'eq', args }); return q }, in: () => q, order: () => q, range: start => { paged = true; offset = start; return q }, single: async () => ({ data: mocks.tables[table]?.[0], error: null }), then: resolve => resolve(result()) }
  return q
} }) }))
import { getCompetitionFoundation } from '../../src/services/competition.service.js'
beforeEach(() => {
  mocks.calls = []; mocks.failLinks = false; mocks.failHistory = false; mocks.rpc.mockReset()
  mocks.tables = {
    events: [{ id: 'e', scoring_config: {} }],
    competition_rounds: [{ id: 'r', event_id: 'e', name: 'Final', weight: 0, display_order: 0 }],
    competition_criteria: [{ id: 'c', event_id: 'e', name: 'Quality', percentage: 100, is_active: true, min_score: 1, max_score: 100 }],
    competition_round_criteria: [{ round_id: 'r', criteria_id: 'c' }],
    competition_minor_criteria: [{ id: 'on', event_id: 'e', criteria_id: 'c', name: 'Technique', score_type: 'decimal', is_active: true }, { id: 'off', event_id: 'e', criteria_id: 'c', name: 'Disabled', score_type: 'custom_range', is_active: false }],
  }
})
test('foundation keeps minor activity and gathers complete event-scoped membership pages', async () => {
  const f = await getCompetitionFoundation('e', 'owner')
  expect(f.criteria[0].minorCriteria).toHaveLength(2)
  expect(f.criteria[0].minorCriteria[1].isActive).toBe(false)
  expect(f.criteriaReadiness.allReady).toBe(true)
  expect(f.rounds[0].criteriaIds).toEqual(['c'])
  expect(mocks.calls).toContainEqual({ table: 'competition_round_criteria', method: 'eq', args: ['competition_rounds.event_id', 'e'] })
})
test('membership query failure cannot masquerade as an empty valid configuration', async () => {
  mocks.failLinks = true
  await expect(getCompetitionFoundation('e', 'owner')).rejects.toThrow('membership read failed')
})

function publishedRounds(advancementType = 'none') {
  mocks.tables.events[0].official_rules_id = 'v'
  mocks.tables.events[0].status = 'active'
  mocks.tables.competition_contestants = ['a', 'b', 'c'].map((id, index) => ({ id, event_id: 'e', name: id, contestant_number: index + 1 }))
  mocks.tables.competition_rounds = [
    { id: 'pre', event_id: 'e', name: 'Preliminary', weight: 0, display_order: 0, advancement_type: advancementType, advancement_value: 1, workflow: { purpose: 'qualification', progression: 'back_to_zero' } },
    { id: 'final', event_id: 'e', name: 'Final', weight: 0, display_order: 1, workflow: { purpose: 'final', progression: 'back_to_zero' } },
  ]
  mocks.tables.competition_round_contestants = [{ round_id: 'pre', contestant_id: 'a' }, { round_id: 'pre', contestant_id: 'b' }, { round_id: 'final', contestant_id: 'c' }]
  mocks.tables.competition_round_criteria = [{ round_id: 'pre', criteria_id: 'c' }, { round_id: 'final', criteria_id: 'c' }]
  return {
    known: true,
    rules: { id: 'v', snapshot: {
      event: { id: 'e' }, contestants: ['a', 'b', 'c'].map(id => ({ id })),
      rounds: [
        { id: 'pre', name: 'Preliminary', displayOrder: 0, advancementType, advancementValue: 1, purpose: 'qualification', contestantIds: ['a', 'b'], criteriaIds: ['c'] },
        { id: 'final', name: 'Final', displayOrder: 1, purpose: 'final', contestantIds: ['c'], criteriaIds: ['c'] },
      ],
      criteria: [{ id: 'c', isActive: true }], judges: [], scoringConfig: { calculationMethod: 'weighted_average' },
    } },
    session: { id: 's', rules_version: 'v', current_round_id: 'pre', status: 'active', access_config: { entries: { mode: 'all' }, criteria: { mode: 'all' } } },
    submissions: [], calculations: [],
  }
}

test('published No Elimination uses eligible frozen source entries without opening Final scoring or trusting planned Final membership', async () => {
  const context = publishedRounds()
  mocks.tables.competition_eligibility_decisions = [{ id: 'withdrawal', event_id: 'e', rules_version: 'v', contestant_id: 'b', round_id: 'pre', status: 'approved' }]
  mocks.rpc.mockResolvedValue({ data: context, error: null })

  const f = await getCompetitionFoundation('e', 'owner')

  expect(mocks.rpc).toHaveBeenCalledWith('competition_participation_context', { p_event: 'e', p_actor: 'owner' })
  expect(f.participation.rounds.pre.scoringStatus).toBe('open')
  expect(f.participation.rounds.final).toMatchObject({ mode: 'all_continue', phase: 'all_continue', sourceRoundId: 'pre', plannedEntryIds: ['a'], eligibleEntryIds: ['a'], storedEntryIds: ['c'], scoringStatus: 'not_open' })
  expect(mocks.calls).toContainEqual({ table: 'competition_eligibility_decisions', method: 'eq', args: ['event_id', 'e'] })
})

test('published Final resolves paginated current-version decisions rather than stale or planned qualifiers', async () => {
  const context = publishedRounds('top_n')
  mocks.tables.competition_advancement_decisions = [
    { id: 'old', event_id: 'e', rules_version: 'old-v', round_id: 'pre', next_round_id: 'final', qualifiers: ['c'] },
    { id: 'current', event_id: 'e', rules_version: 'v', round_id: 'pre', next_round_id: 'final', qualifiers: ['a'] },
  ]
  mocks.rpc.mockResolvedValue({ data: context, error: null })

  const f = await getCompetitionFoundation('e', 'owner')

  expect(f.advancementDecisions).toHaveLength(2)
  expect(f.participation.rounds.final).toMatchObject({ mode: 'qualification', phase: 'qualification_confirmed', plannedEntryIds: ['a', 'b'], eligibleEntryIds: ['a'], storedEntryIds: ['c'], confirmedQualifierIds: ['a'], decisionId: 'current', scoringStatus: 'not_open' })
})

test.each([
  { data: null, error: { code: 'PGRST202', message: 'competition_participation_context is not in the schema cache' } },
  { data: null, error: null },
])('published participation fails closed when migration 097 context is unavailable: %j', async response => {
  publishedRounds()
  mocks.rpc.mockResolvedValue(response)
  await expect(getCompetitionFoundation('e', 'owner')).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('migration 099') })
})

test('published participation history query failure is reported before using partial history', async () => {
  const context = publishedRounds('top_n')
  mocks.failHistory = true
  mocks.rpc.mockResolvedValue({ data: context, error: null })
  await expect(getCompetitionFoundation('e', 'owner')).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('confirmed participation history') })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
