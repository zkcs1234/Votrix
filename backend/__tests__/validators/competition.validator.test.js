import { describe, test, expect } from 'vitest'
import { ApiError } from '../../src/utils/ApiError.js'
import {
  validateCategory,
  validateRound,
  validateScoringConfig,
  validateJudgeRole,
  validateAssignment,
} from '../../src/validators/competition.validator.js'

describe('Category validator', () => {
  test('accepts a valid category', () => {
    const result = validateCategory({ name: 'Talent', weight: 60, displayOrder: 1, isActive: true })
    expect(result).toMatchObject({ name: 'Talent', weight: 60, displayOrder: 1, isActive: true })
  })

  test('throws on missing name', () => {
    expect(() => validateCategory({ name: '  ', weight: 10 })).toThrow(ApiError)
  })

  test('throws on out-of-range weight', () => {
    expect(() => validateCategory({ name: 'X', weight: 110 })).toThrow(/weight/i)
  })
})

describe('Round validator', () => {
  test('accepts a valid round', () => {
    const r = validateRound({ name: 'Final', weight: 100, isOpen: true, categoryId: 'cat-1' })
    expect(r).toMatchObject({ name: 'Final', weight: 100, isOpen: true, categoryId: 'cat-1' })
  })

  test('throws on missing name', () => {
    expect(() => validateRound({ name: '', weight: 10 })).toThrow(ApiError)
  })

  test('throws on out-of-range weight', () => {
    expect(() => validateRound({ name: 'X', weight: -5 })).toThrow(/weight/i)
  })
})

describe('Scoring config validator', () => {
  test('accepts a valid config', () => {
    const c = validateScoringConfig({
      scoreType: 'range_1_10',
      calculationMethod: 'average',
      decimalPlaces: 3,
    })
    expect(c).toMatchObject({ scoreType: 'range_1_10', calculationMethod: 'average', decimalPlaces: 3 })
  })

  test('rejects unknown scoreType', () => {
    expect(() => validateScoringConfig({ scoreType: 'nope' })).toThrow(/scoreType/i)
  })

  test('rejects unknown calculationMethod', () => {
    expect(() => validateScoringConfig({ calculationMethod: 'magic' })).toThrow(/calculationMethod/i)
  })

  test('custom_range requires customMin/customMax', () => {
    expect(() => validateScoringConfig({ scoreType: 'custom_range' })).toThrow(/custom/i)
    expect(() =>
      validateScoringConfig({ scoreType: 'custom_range', customMin: 100, customMax: 10 }),
    ).toThrow(/customMax/i)
  })

  test('rejects non-integer decimal places', () => {
    expect(() => validateScoringConfig({ decimalPlaces: 1.5 })).toThrow(/decimalPlaces/i)
  })
})

describe('Judge role validator', () => {
  test('defaults to judge', () => {
    expect(validateJudgeRole({})).toMatchObject({ role: 'judge', isActive: true })
  })
  test('rejects unknown role', () => {
    expect(() => validateJudgeRole({ role: 'evil' })).toThrow(/role/i)
  })
})

describe('Assignment validator', () => {
  test('accepts event scope', () => {
    expect(validateAssignment({ scope: 'event', scopeId: 'abc' })).toEqual({
      scope: 'event',
      scopeId: 'abc',
    })
  })
  test('rejects unknown scope', () => {
    expect(() => validateAssignment({ scope: 'whatever', scopeId: 'abc' })).toThrow(/scope/i)
  })
  test('requires scopeId', () => {
    expect(() => validateAssignment({ scope: 'round' })).toThrow(/scopeId/i)
  })
})
