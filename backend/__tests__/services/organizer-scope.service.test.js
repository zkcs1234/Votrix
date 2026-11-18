import { describe, expect, test, vi } from 'vitest'

vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn() }))

import {
  isStudentInScope,
  areCohortValuesInScope,
  filterCohortsForScope,
  applyStudentScope,
  scopedSelect,
  isAllAccess,
} from '../../src/services/organizer-scope.service.js'

const all = { scopeType: 'all', programs: [] }
const bscs = { scopeType: 'scoped', programs: ['BSCS'] }
const emptyScoped = { scopeType: 'scoped', programs: [] }

describe('organizer scope', () => {
  test('all access (or a missing scope) sees every program', () => {
    expect(isStudentInScope(all, { program: 'BSIT' })).toBe(true)
    expect(isStudentInScope(null, { program: 'BSIT' })).toBe(true)
    expect(areCohortValuesInScope(all, ['BSIT'])).toBe(true)
    expect(isAllAccess(undefined)).toBe(true)
  })

  test('a scoped organizer sees only the listed programs', () => {
    expect(isStudentInScope(bscs, { program: 'BSCS' })).toBe(true)
    expect(isStudentInScope(bscs, { program: 'BSIT' })).toBe(false)
    expect(areCohortValuesInScope(bscs, ['BSCS'])).toBe(true)
    expect(areCohortValuesInScope(bscs, ['BSCS', 'BSIT'])).toBe(false)
    expect(filterCohortsForScope(bscs, { programs: [{ value: 'BSCS' }, { value: 'BSIT' }] }))
      .toEqual({ programs: [{ value: 'BSCS' }] })
  })

  test('a scoped organizer with no programs sees no one, not everyone', () => {
    expect(isStudentInScope(emptyScoped, { program: 'BSCS' })).toBe(false)
    expect(areCohortValuesInScope(emptyScoped, ['BSCS'])).toBe(false)
    expect(filterCohortsForScope(emptyScoped, { programs: [{ value: 'BSCS' }] })).toEqual({ programs: [] })
  })

  test('SQL helpers only add the program filter when the scope restricts students', () => {
    const query = { in: vi.fn(() => 'filtered') }
    expect(scopedSelect(all, '*')).toBe('*')
    expect(applyStudentScope(query, all)).toBe(query)
    expect(query.in).not.toHaveBeenCalled()

    expect(scopedSelect(bscs, 'event_id')).toBe('event_id, users!inner(program)')
    expect(applyStudentScope(query, bscs)).toBe('filtered')
    expect(query.in).toHaveBeenCalledWith('users.program', ['BSCS'])
    applyStudentScope(query, emptyScoped)
    expect(query.in).toHaveBeenLastCalledWith('users.program', [])
  })
})
