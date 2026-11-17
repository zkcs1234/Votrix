import { describe, expect, it } from 'vitest'
import { hasQuestionErrors, validateQuestionForm } from './pollQuestionValidation'

const choiceType = { key: 'single_choice', ui: { input: 'radio' }, answerFormat: { kind: 'choice' } }
const numericType = {
  key: 'number',
  ui: { input: 'number' },
  answerFormat: { kind: 'numeric' },
  configSchema: { min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number', minimum: 0 } },
}
const textType = {
  key: 'short_text',
  ui: { input: 'text' },
  answerFormat: { kind: 'text' },
  configSchema: { maxLength: { type: 'integer', minimum: 1, maximum: 5000 } },
}

const opt = (label) => ({ label, imageUrl: '', imageAssetId: null })
const form = (overrides = {}) => ({
  question: 'Favourite colour?',
  type: 'single_choice',
  required: true,
  typeConfig: {},
  options: [opt('Red'), opt('Blue')],
  ...overrides,
})

describe('validateQuestionForm', () => {
  it('accepts a complete choice question', () => {
    expect(hasQuestionErrors(validateQuestionForm(form(), choiceType))).toBe(false)
  })

  it('requires question text, ignoring whitespace', () => {
    expect(validateQuestionForm(form({ question: '   ' }), choiceType).question).toBe('Question text is required')
  })

  it('needs two non-blank options for choice questions', () => {
    const errors = validateQuestionForm(form({ options: [opt('Red'), opt('  ')] }), choiceType)
    expect(errors.options).toBe('Add at least two options')
  })

  it('flags a duplicate option on the repeated entry, case-insensitively', () => {
    const errors = validateQuestionForm(form({ options: [opt('Red'), opt('Blue'), opt('red')] }), choiceType)
    expect(errors.optionLabels).toEqual({ 2: 'This option is already listed' })
    expect(errors.options).toBeUndefined()
  })

  it('does not ask for options on types that do not use them', () => {
    const errors = validateQuestionForm(form({ options: [opt(''), opt('')], type: 'number' }), numericType)
    expect(errors.options).toBeUndefined()
  })

  it('checks numeric settings: step above zero and min not above max', () => {
    expect(validateQuestionForm(form({ typeConfig: { step: 0 } }), numericType).config.step).toBe('Step must be greater than 0')
    expect(validateQuestionForm(form({ typeConfig: { min: 10, max: 5 } }), numericType).config.min).toBe(
      'Min cannot be greater than Max',
    )
    expect(hasQuestionErrors(validateQuestionForm(form({ typeConfig: { min: 1, max: 5, step: 1 } }), numericType))).toBe(false)
  })

  it('applies the type configSchema bounds and whole-number rule', () => {
    expect(validateQuestionForm(form({ typeConfig: { maxLength: 0 } }), textType).config.maxLength).toBe('Max length must be at least 1')
    expect(validateQuestionForm(form({ typeConfig: { maxLength: 9000 } }), textType).config.maxLength).toBe('Max length must be at most 5000')
    expect(validateQuestionForm(form({ typeConfig: { maxLength: 2.5 } }), textType).config.maxLength).toBe('Max length must be a whole number')
  })

  it('treats empty optional settings as fine', () => {
    expect(hasQuestionErrors(validateQuestionForm(form({ typeConfig: {} }), textType))).toBe(false)
  })
})
