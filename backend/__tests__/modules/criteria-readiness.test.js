import { expect, test } from 'vitest'
import { evaluateCriteriaReadiness, criteriaSource } from '../../../shared/competition-criteria-readiness.js'
const parent = (id, percentage = 100, extra = {}) => ({ id, name: id, percentage, minScore: 1, maxScore: 100, is_active: true, minorCriteria: [], ...extra })
const round = (id, criteriaIds, displayOrder = 0) => ({ id, name: id, displayOrder, criteriaIds })
const validate = (criteria, rounds = [], scoringConfig = {}) => evaluateCriteriaReadiness({ event: { id: 'e' }, criteria, rounds, scoringConfig })

test('saved active criteria drive round progress in official order without altering records', () => {
  const criteria = [parent('pre'), parent('final', 60), parent('disabled', 40, { is_active: false })]
  const rounds = [round('Final', ['final', 'disabled'], 2), round('Preliminary', ['pre'], 1)]
  const before = structuredClone({ criteria, rounds })
  const result = validate(criteria, rounds)
  expect(result.scopes.map(s => [s.name, s.total, s.status])).toEqual([['Preliminary', 100, 'Complete'], ['Final', 60, 'In Progress']])
  expect(result).toMatchObject({ allReady: false, readyCount: 1 })
  expect({ criteria, rounds }).toEqual(before)
})
test('single and flat scoring accept supported direct parent bounds', () => {
  expect(validate([parent('quality')]).allReady).toBe(true)
  expect(validate([parent('quality')], [round('single', ['quality'])]).allReady).toBe(true)
  expect(validate([]).scopes[0].status).toBe('Not Started')
})
test('100% with missing minors and no valid direct bounds needs attention', () => {
  const result = validate([parent('quality', 100, { minScore: null, maxScore: null })])
  expect(result.scopes[0]).toMatchObject({ total: 100, ready: false, status: 'Needs Attention' })
  expect(result.scopes[0].issues.some(i => i.code === 'invalid_range')).toBe(true)
})
test('disabled configured minors are not silently converted to direct scoring', () => {
  const result = validate([parent('quality', 100, { minorCriteria: [{ id: 'm', name: 'Technique', scoreType: 'range_1_10', isActive: false }] })])
  expect(result.allReady).toBe(false)
  expect(result.scopes[0].issues.some(i => i.code === 'missing_inputs')).toBe(true)
})
test('active custom ranges are strict; malformed and zero denominators cannot use fallback bounds', () => {
  for (const m of [{ customMin: null, customMax: 10 }, { customMin: 0, customMax: null }, { customMin: 10, customMax: 5 }, { customMin: 0, customMax: 0 }, { customMin: 0, customMax: Infinity }]) {
    expect(validate([parent('c', 100, { minorCriteria: [{ id: 'm', scoreType: 'custom_range', ...m }] })]).allReady).toBe(false)
  }
  expect(validate([parent('c', 100, { minorCriteria: [{ id: 'm', scoreType: 'custom_range', customMin: 0, customMax: 10 }] })]).allReady).toBe(true)
})
test('a disabled invalid minor is excluded when a valid active input exists', () => {
  expect(validate([parent('c', 100, { minorCriteria: [{ id: 'm', scoreType: 'decimal' }, { id: 'disabled', isActive: false, scoreType: 'custom_range' }] })]).allReady).toBe(true)
})
test('duplicate memberships and foreign links block completion even at 100%', () => {
  for (const ids of [['c', 'c'], ['c', 'foreign']]) {
    expect(validate([parent('c')], [round('round', ids)]).scopes[0]).toMatchObject({ total: 100, ready: false, status: 'Needs Attention' })
  }
  expect(validate([parent('c', 100, { event_id: 'other' })]).allReady).toBe(false)
})
test('criterion changes invalidate every round that reuses the criterion', () => {
  const rounds = [round('first', ['c']), round('last', ['c'], 1)]
  expect(validate([parent('c')], rounds).readyCount).toBe(2)
  expect(validate([parent('c', 90)], rounds).readyCount).toBe(0)
})
test('one shared tolerance applies to fractional sums, budget overruns, and readiness', () => {
  expect(validate([parent('a', 33.333), parent('b', 33.333), parent('c', 33.333)]).allReady).toBe(true)
  expect(validate([parent('a', 99.99)]).allReady).toBe(false)
  expect(validate([parent('a', 80), parent('b', 30)]).scopes[0].status).toBe('Needs Attention')
})
test('overall-round minor weights must equal their major percentage', () => {
  const weighted = parent('cheers', 30, { minorCriteria: [
    { id: 'voice', name: 'Voice', minScore: 1, maxScore: 10, percentage: 10 },
    { id: 'audience', name: 'Audience', minScore: 1, maxScore: 10, percentage: 10 },
    { id: 'motion', name: 'Motion', minScore: 1, maxScore: 10, percentage: 10 },
  ] })
  const other = parent('routine', 70)
  expect(validate([weighted, other], [], { minorWeightBasis: 'overall' }).allReady).toBe(true)
  weighted.minorCriteria[2].percentage = 5
  const result = validate([weighted, other], [], { minorWeightBasis: 'overall' })
  expect(result.allReady).toBe(false)
  expect(result.scopes[0].issues.find(issue => issue.code === 'minor_weight_total').message).toContain('must total 30%')
})
test('source projection tracks disabled inputs and membership changes with stable ordering', () => {
  const f = { criteria: [parent('b', 50), parent('a', 50)], rounds: [round('r', ['b', 'a'])] }
  const source = criteriaSource(f)
  expect(source.criteria.map(c => c.id)).toEqual(['a', 'b'])
  expect(source.rounds[0].criteriaIds).toEqual(['a', 'b'])
  expect(criteriaSource({ ...f, criteria: [parent('b', 50), parent('a', 50, { is_active: false })] })).not.toEqual(source)
})
