import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ tables: {}, reads: [], failure: null }))
vi.mock('../../src/services/event.service.js', () => ({ assertOrganizerOwnsEvent: vi.fn(), getEventById: vi.fn() }))
vi.mock('../../src/services/competition.service.js', () => ({ getCompetitionFoundation: vi.fn() }))
vi.mock('../../src/websocket/ws-emitter.js', () => ({ emitToEvent: vi.fn(), emitToEventOrganizer: vi.fn() }))
vi.mock('../../src/foundation/db.js', () => ({ db: () => ({ from: table => {
  const filters = []
  let offset = null
  const rows = () => (mocks.tables[table] ?? []).filter(row => filters.every(([key, value]) => row[key] === value))
  const result = () => ({ data: offset === null ? rows() : rows().slice(offset, offset + 1), count: rows().length, error: mocks.failure?.table === table ? mocks.failure.error : null })
  const q = {
    select: () => q,
    eq: (key, value) => { filters.push([key, value]); return q },
    order: () => q, limit: () => q,
    range: start => { offset = start; mocks.reads.push({ table, offset, filters: [...filters] }); return q },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: resolve => resolve(result()),
  }
  return q
} }) }))

import { rulesFor } from '../../src/services/competition-workflow.service.js'

beforeEach(() => {
  mocks.reads = []; mocks.failure = null
  mocks.tables = {
    competition_rule_versions: [{ id: 'v', event_id: 'e', version: 2, snapshot: {
      event: { id: 'e' }, contestants: ['a', 'b', 'c', 'outside'].map(id => ({ id })),
      scoringConfig: { calculationMethod: 'weighted_average', perDivision: false },
      rounds: [
        { id: 'pre', displayOrder: 0, purpose: 'qualification', advancementType: 'none', nextRoundId: 'final', contestantIds: ['a', 'b', 'c'], criteriaIds: ['quality'], progression: 'weighted', weight: 30 },
        { id: 'final', displayOrder: 1, purpose: 'final', contestantIds: ['outside'], criteriaIds: ['answer'], progression: 'back_to_zero', weight: 70 },
      ],
    } }],
    competition_advancement_decisions: [],
    competition_eligibility_decisions: [
      { id: 'pending', event_id: 'e', rules_version: 'v', contestant_id: 'a', round_id: 'pre', status: 'pending' },
      { id: 'historical', event_id: 'e', rules_version: 'old-v', contestant_id: 'a', round_id: 'pre', status: 'approved' },
      { id: 'source-excluded', event_id: 'e', rules_version: 'v', contestant_id: 'b', round_id: 'pre', status: 'approved' },
      { id: 'final-excluded', event_id: 'e', rules_version: 'v', contestant_id: 'c', round_id: 'final', status: 'approved' },
      { id: 'other-event', event_id: 'other', rules_version: 'v', contestant_id: 'a', round_id: null, status: 'approved' },
    ],
  }
})

test('effective No Elimination rules collect all eligibility pages and inherit eligible source entries independently of score progression', async () => {
  const result = await rulesFor('e')

  expect(result.rounds[0].contestantIds).toEqual(['a', 'c'])
  expect(result.rounds[1]).toMatchObject({ contestantIds: ['a'], criteriaIds: ['answer'], progression: 'back_to_zero', weight: 70 })
  expect(mocks.reads).toEqual([0, 1, 2, 3].map(offset => ({ table: 'competition_eligibility_decisions', offset, filters: [['event_id', 'e']] })))
  expect(mocks.tables.competition_rule_versions[0].snapshot.rounds[1].contestantIds).toEqual(['outside'])
})

test('effective elimination rules require current-version confirmed qualifiers and ignore preassigned Final entries', async () => {
  mocks.tables.competition_rule_versions[0].snapshot.rounds[0].advancementType = 'top_n'
  mocks.tables.competition_rule_versions[0].snapshot.rounds[0].advancementValue = 1
  mocks.tables.competition_advancement_decisions = [{ id: 'stale', event_id: 'e', rules_version: 'old-v', round_id: 'pre', next_round_id: 'final', qualifiers: ['outside'] }]
  expect((await rulesFor('e')).rounds[1].contestantIds).toEqual([])

  mocks.tables.competition_advancement_decisions.push({ id: 'confirmed', event_id: 'e', rules_version: 'v', round_id: 'pre', next_round_id: 'final', qualifiers: ['a', 'c'] })
  expect((await rulesFor('e')).rounds[1].contestantIds).toEqual(['a'])
})

test('unavailable eligibility migration cannot turn excluded entries into an apparent full Final roster', async () => {
  mocks.failure = { table: 'competition_eligibility_decisions', error: { code: 'PGRST205', message: 'eligibility relation absent from schema cache' } }
  await expect(rulesFor('e')).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('100') })
})

test('events without a frozen rule version do not read an unrelated participation history', async () => {
  mocks.tables.competition_rule_versions = []
  await expect(rulesFor('e')).resolves.toBeNull()
  expect(mocks.reads).toEqual([])
})
