import { describe, expect, test } from 'vitest'
import {
  toStringList,
  validateApplicationFields,
  validateDeclineReason,
  validateInvitationInput,
} from '../../src/validators/organizer-application.validator.js'

const taxonomy = { programs: ['BSCS', 'BSIT'] }

const valid = {
  organizerName: 'Ada Lovelace',
  position: 'President',
  organizationName: 'Computing Society',
  organizationType: 'co-curricular',
  scopeType: 'scoped',
  programs: ['bscs'],
}

function errorsOf(fn) {
  try {
    fn()
  } catch (err) {
    return err.details?.errors ?? [err.message]
  }
  return []
}

describe('validateApplicationFields', () => {
  test('canonicalizes organization type and scope against the taxonomy', () => {
    const out = validateApplicationFields(valid, taxonomy)
    expect(out.organizationType).toBe('Co-curricular')
    expect(out.scope).toEqual({ scopeType: 'scoped', programs: ['BSCS'] })
  })

  test('rejects an organization type outside the two options when strict', () => {
    const errors = errorsOf(() => validateApplicationFields({ ...valid, organizationType: 'Club' }, taxonomy))
    expect(errors.join(' ')).toMatch(/organization type must be one of/)
  })

  test('allows free-text organization type for admin corrections', () => {
    const out = validateApplicationFields({ ...valid, organizationType: 'Student Organization' }, taxonomy, {
      strictOrganizationType: false,
    })
    expect(out.organizationType).toBe('Student Organization')
  })

  test('requires an explicit scope type', () => {
    const errors = errorsOf(() => validateApplicationFields({ ...valid, scopeType: '' }, taxonomy))
    expect(errors.join(' ')).toMatch(/access scope must be/)
  })

  test('rejects programs that are not in the managed taxonomy', () => {
    const errors = errorsOf(() => validateApplicationFields({ ...valid, programs: ['NOPE'] }, taxonomy))
    expect(errors.join(' ')).toMatch(/not in the managed list/)
  })

  test('a scoped request needs at least one program', () => {
    const errors = errorsOf(() => validateApplicationFields({ ...valid, programs: [] }, taxonomy))
    expect(errors.join(' ')).toMatch(/at least one program/)
  })

  test('"all" scope ignores programs', () => {
    const out = validateApplicationFields({ ...valid, scopeType: 'all', programs: ['NOPE'] }, taxonomy)
    expect(out.scope).toEqual({ scopeType: 'all', programs: [] })
  })

  test('reports every missing required field at once', () => {
    const errors = errorsOf(() => validateApplicationFields({ scopeType: 'all' }, taxonomy))
    expect(errors).toEqual(
      expect.arrayContaining([
        'organizer name is required',
        'position is required',
        'organization name is required',
        'organization type is required',
      ]),
    )
  })
})

describe('toStringList', () => {
  test('accepts arrays, JSON strings and delimited text', () => {
    expect(toStringList(['A', ' B '])).toEqual(['A', 'B'])
    expect(toStringList('["A","B"]')).toEqual(['A', 'B'])
    expect(toStringList('A; B, C')).toEqual(['A', 'B', 'C'])
    expect(toStringList(undefined)).toEqual([])
  })
})

describe('validateInvitationInput', () => {
  test('defaults expiry to 7 days and lowercases the email', () => {
    expect(validateInvitationInput({ email: ' Jane@Example.COM ' })).toEqual({
      email: 'jane@example.com',
      expiresInDays: 7,
      note: null,
    })
  })

  test.each([[0], [31], [1.5], ['abc']])('rejects expiry %s', (days) => {
    expect(errorsOf(() => validateInvitationInput({ email: 'a@b.co', expiresInDays: days })).join(' ')).toMatch(/expiry/)
  })

  test('rejects a bad email and an over-long note', () => {
    expect(errorsOf(() => validateInvitationInput({ email: 'nope' }))).toContain('invalid email')
    expect(errorsOf(() => validateInvitationInput({ email: 'a@b.co', note: 'x'.repeat(501) })).join(' ')).toMatch(/note/)
  })
})

describe('validateDeclineReason', () => {
  test('requires a non-empty, bounded reason', () => {
    expect(validateDeclineReason('  Missing certificates ')).toBe('Missing certificates')
    expect(errorsOf(() => validateDeclineReason('   '))).toContain('a decline reason is required')
    expect(errorsOf(() => validateDeclineReason('x'.repeat(1001))).join(' ')).toMatch(/1000/)
  })
})
