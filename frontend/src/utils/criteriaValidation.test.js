import { describe, expect, it } from 'vitest'
import { validateCriterionName, validateCustomRange, validateWeight } from './criteriaValidation'

describe('criteria validation', () => {
  it('requires a name', () => {
    expect(validateCriterionName('  ', 'Criteria name')).toBe('Criteria name is required')
    expect(validateCriterionName('Technique')).toBeNull()
  })

  it('requires a positive weight', () => {
    expect(validateWeight('')).toBe('Enter a weight greater than 0')
    expect(validateWeight('0')).toBe('Weight must be greater than 0')
    expect(validateWeight('-5')).toBe('Weight must be greater than 0')
    expect(validateWeight('abc')).toBe('Weight must be a number')
    expect(validateWeight('40')).toBeNull()
  })

  it('caps the weight at 100 and at what is left of the budget', () => {
    expect(validateWeight('101')).toBe('Weight cannot be more than 100%')
    expect(validateWeight('50', { remaining: 40, tolerance: 0.005, scopeLabel: 'this round' })).toBe(
      'Only 40.00% left in this round. Lower the weight.',
    )
    expect(validateWeight('40', { remaining: 40, tolerance: 0.005 })).toBeNull()
    // within the rounding tolerance
    expect(validateWeight('40.004', { remaining: 40, tolerance: 0.005 })).toBeNull()
  })

  it('needs a custom range with max above min', () => {
    expect(validateCustomRange('', '10')).toBe('Enter both a minimum and a maximum score')
    expect(validateCustomRange('5', '5')).toBe('Maximum must be greater than minimum')
    expect(validateCustomRange('-10', '-5')).toBe('Maximum must be greater than 0')
    expect(validateCustomRange('x', '5')).toBe('Scores must be numbers')
    expect(validateCustomRange('0', '10')).toBeNull()
  })
})
