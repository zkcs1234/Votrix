import { afterEach, expect, test, vi } from 'vitest'
import { childCompetitionsEnabled, legacyPermissionApplies, resolveLegacyCompetitionContext } from '../../src/modules/competition-context.js'

afterEach(() => vi.unstubAllEnvs())
const legacy = { id: 'legacy', event_id: 'e', origin: 'legacy' }
const mapping = { event_id: 'e', competition_id: 'legacy' }
test('feature is disabled unless explicitly enabled', () => {
  vi.stubEnv('COMPETITION_CHILD_CONTEXTS_ENABLED', ''); expect(childCompetitionsEnabled()).toBe(false)
  vi.stubEnv('COMPETITION_CHILD_CONTEXTS_ENABLED', 'true'); expect(childCompetitionsEnabled()).toBe(true)
})
test('unmapped legacy events and explicit single legacy context preserve event API identity', () => {
  expect(resolveLegacyCompetitionContext('e', [], null)).toEqual({ eventId: 'e', competitionId: null, kind: 'unmapped_legacy' })
  expect(resolveLegacyCompetitionContext('e', [legacy], mapping)).toEqual({ eventId: 'e', competitionId: 'legacy', kind: 'mapped_legacy' })
})
test('five contexts never select the first competition implicitly', () => {
  expect(() => resolveLegacyCompetitionContext('e', [legacy, ...[1, 2, 3, 4].map(id => ({ id, event_id: 'e', origin: 'native' }))], mapping)).toThrow('competition-scoped operations')
})
test.each([[{ id: 'n', event_id: 'e', origin: 'native' }, null], [legacy, null], [legacy, { ...mapping, event_id: 'foreign' }], [legacy, { ...mapping, competition_id: 'wrong' }]])('single identity is not a substitute for an explicit compatibility mapping', (child, map) => {
  expect(() => resolveLegacyCompetitionContext('e', [child], map)).toThrow('explicit legacy competition mapping')
})
test('historical event-wide privileges apply only to the mapped legacy child', () => {
  expect(legacyPermissionApplies('e', legacy, mapping)).toBe(true)
  for (const child of [{ id: 'new', event_id: 'e', origin: 'native' }, { ...legacy, event_id: 'foreign' }, { ...legacy, id: 'unmapped' }]) expect(legacyPermissionApplies('e', child, mapping)).toBe(false)
})
