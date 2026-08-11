import { describe, test, expect } from 'vitest'
import { canJudgeScore, mergeJudgeRows } from '../../src/services/pageant.service.js'

// We import the pure helper from the service module to assert the
// Phase 6 assignment-scope logic without standing up a Supabase client.

describe('Phase 6: canJudgeScore', () => {
  test('mergeJudgeRows prefers the competition_judges record id for assignment FK integrity', () => {
    const merged = mergeJudgeRows(
      {
        id: 'participant-row-id',
        event_id: 'evt-1',
        user_id: 'user-1',
        email: 'judge@example.com',
        display_name: null,
        role: 'judge',
        is_active: true,
        has_submitted: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
      },
      {
        id: 'competition-judge-id',
        event_id: 'evt-1',
        user_id: 'user-1',
        users: { email: 'judge@example.com' },
        display_name: 'Judge One',
        role: 'judge',
        is_active: true,
        has_submitted: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
      },
    )

    expect(merged.id).toBe('competition-judge-id')
    expect(merged.judgeId).toBe('user-1')
    expect(merged.eventId).toBe('evt-1')
    expect(merged.displayName).toBe('Judge One')
  })

  test('non-first-class judges are always allowed (legacy path)', () => {
    const ctx = { isFirstClass: false, role: 'judge', assignments: [] }
    expect(canJudgeScore(ctx, { roundId: 'r1' })).toBe(true)
    expect(canJudgeScore(ctx, { categoryId: 'c1' })).toBe(true)
  })

  test('first-class judge with no assignments is event-wide by default', () => {
    const ctx = { isFirstClass: true, role: 'judge', assignments: [] }
    expect(canJudgeScore(ctx, { roundId: 'r1' })).toBe(true)
    expect(canJudgeScore(ctx, { categoryId: 'c1' })).toBe(true)
    expect(canJudgeScore(ctx, {})).toBe(true)
  })

  test('event-scope assignment unlocks any round/category', () => {
    const ctx = {
      isFirstClass: true,
      role: 'judge',
      assignments: [{ id: 'a1', scope: 'event', scope_id: 'evt' }],
    }
    expect(canJudgeScore(ctx, { roundId: 'r1' })).toBe(true)
    expect(canJudgeScore(ctx, { categoryId: 'c1' })).toBe(true)
  })

  test('round assignment only unlocks the matching round', () => {
    const ctx = {
      isFirstClass: true,
      role: 'judge',
      assignments: [{ id: 'a1', scope: 'round', scope_id: 'r1' }],
    }
    expect(canJudgeScore(ctx, { roundId: 'r1' })).toBe(true)
    expect(canJudgeScore(ctx, { roundId: 'r2' })).toBe(false)
    expect(canJudgeScore(ctx, {})).toBe(false)
  })

  test('category assignment only unlocks the matching category', () => {
    const ctx = {
      isFirstClass: true,
      role: 'judge',
      assignments: [{ id: 'a1', scope: 'category', scope_id: 'c1' }],
    }
    expect(canJudgeScore(ctx, { categoryId: 'c1' })).toBe(true)
    expect(canJudgeScore(ctx, { categoryId: 'c2' })).toBe(false)
  })

  test('multiple assignments combine (OR)', () => {
    const ctx = {
      isFirstClass: true,
      role: 'judge',
      assignments: [
        { id: 'a1', scope: 'round', scope_id: 'r1' },
        { id: 'a2', scope: 'category', scope_id: 'c2' },
      ],
    }
    expect(canJudgeScore(ctx, { roundId: 'r1' })).toBe(true)
    expect(canJudgeScore(ctx, { categoryId: 'c2' })).toBe(true)
    expect(canJudgeScore(ctx, { roundId: 'r2' })).toBe(false)
  })
})
