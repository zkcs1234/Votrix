import { describe, test, expect } from 'vitest'
import {
  validateCustomType,
  validateCustomTypeUpdate,
  validatePollAnswers,
} from '../../src/validators/polling.validator.js'

describe('polling.validator — validateCustomType', () => {
  const valid = {
    key: 'net_promoter',
    label: 'Net Promoter',
    answerFormat: { kind: 'numeric', min: 0, max: 10, step: 1 },
  }

  test('accepts a well-formed custom type', () => {
    const out = validateCustomType(valid)
    expect(out.key).toBe('net_promoter')
    expect(out.label).toBe('Net Promoter')
    expect(out.isActive).toBe(true)
  })

  test('rejects a missing key', () => {
    expect(() => validateCustomType({ ...valid, key: '  ' })).toThrow(/key is required/)
  })

  test('rejects a missing label', () => {
    expect(() => validateCustomType({ ...valid, label: '' })).toThrow(/label is required/)
  })

  test('rejects a missing/invalid answerFormat (previously inserted raw → poisoned submit path)', () => {
    expect(() => validateCustomType({ ...valid, answerFormat: undefined })).toThrow(
      /answerFormat is required/,
    )
    expect(() => validateCustomType({ ...valid, answerFormat: { kind: 'foo' } })).toThrow(
      /answerFormat\.kind must be one of/,
    )
  })

  test("rejects a 'choice' answerFormat without a valid cardinality", () => {
    expect(() =>
      validateCustomType({ ...valid, answerFormat: { kind: 'choice' } }),
    ).toThrow(/cardinality/)
    expect(
      validateCustomType({ ...valid, answerFormat: { kind: 'choice', cardinality: 'many' } }),
    ).toBeTruthy()
  })
})

describe('polling.validator — validateCustomTypeUpdate', () => {
  test('returns only the provided fields', () => {
    const out = validateCustomTypeUpdate({ label: 'Renamed' })
    expect(out).toEqual({ label: 'Renamed' })
  })

  test('validates answerFormat when present', () => {
    expect(() => validateCustomTypeUpdate({ answerFormat: { kind: 'nope' } })).toThrow(
      /answerFormat\.kind/,
    )
  })

  test('rejects an empty label when present', () => {
    expect(() => validateCustomTypeUpdate({ label: '   ' })).toThrow(/label cannot be empty/)
  })
})

describe('polling.validator — validatePollAnswers', () => {
  test('requires an answers object', () => {
    expect(() => validatePollAnswers({})).toThrow(/answers object is required/)
  })

  test('caps the number of entries', () => {
    const answers = {}
    for (let i = 0; i < 201; i++) answers[`q${i}`] = 'x'
    expect(() => validatePollAnswers({ answers })).toThrow(/Too many answers/)
  })

  test('caps individual answer length', () => {
    expect(() => validatePollAnswers({ answers: { q1: 'a'.repeat(10_001) } })).toThrow(
      /exceeds 10,000 characters/,
    )
  })

  test('passes a normal payload through', () => {
    const answers = { q1: 'yes', q2: ['a', 'b'] }
    expect(validatePollAnswers({ answers })).toBe(answers)
  })
})
