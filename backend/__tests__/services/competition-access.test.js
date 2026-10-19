import { describe, expect, test } from 'vitest'
import { allowsScoring } from '../../src/services/competition-access.service.js'

const judge = { is_active: true, judge_role: 'judge', users: { account_status: 'active' } }
const context = { eventId: 'e', roundId: 'r', categoryId: 'c', divisionId: 'd' }
describe('live scoring authorization', () => {
  test('active event-wide judge may score; reviewers/inactive accounts may not', () => {
    expect(allowsScoring(judge, [], context)).toBe(true)
    for (const entry of [null, { ...judge, is_active: false }, { ...judge, judge_role: 'score_reviewer' }, { ...judge, users: { account_status: 'suspended' } }]) expect(allowsScoring(entry, [], context)).toBe(false)
  })
  test('an explicit assignment grants only its actual same-event scope', () => {
    expect(allowsScoring(judge, [{ scope: 'round', scope_id: 'other' }], context)).toBe(false)
    expect(allowsScoring(judge, [{ scope: 'event', scope_id: 'other' }], context)).toBe(false)
    expect(allowsScoring(judge, [{ scope: 'division', scope_id: 'd' }], context)).toBe(true)
  })
})
