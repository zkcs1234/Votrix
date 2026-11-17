import { describe, expect, it } from 'vitest'
import { pollAnswerErrors, validatePollAnswers } from './pollValidation'

const text = { id: 't', question: 'Comments', required: true, typeDef: { answerFormat: { kind: 'text' } } }
const optional = { id: 'o', question: 'Anything else', required: false, typeDef: { answerFormat: { kind: 'text' } } }
const ranking = {
  id: 'r', question: 'Rank these', required: true, options: [{}, {}, {}],
  typeDef: { answerFormat: { kind: 'ranking' } },
}

describe('pollAnswerErrors', () => {
  it('flags only required questions that are empty, keyed by id', () => {
    expect(pollAnswerErrors([text, optional], {})).toEqual({ t: 'This question is required.' })
    expect(pollAnswerErrors([text, optional], { t: 'hi' })).toEqual({})
  })

  it('treats whitespace-free empties, empty arrays and empty objects as unanswered', () => {
    expect(pollAnswerErrors([text], { t: [] }).t).toBeDefined()
    expect(pollAnswerErrors([text], { t: {} }).t).toBeDefined()
  })

  it('needs every option ranked', () => {
    expect(pollAnswerErrors([ranking], { r: { a: 1, b: 2 } })).toEqual({ r: 'Rank every option.' })
    expect(pollAnswerErrors([ranking], { r: { a: 1, b: 2, c: 3 } })).toEqual({})
  })

  it('validatePollAnswers still returns one sentence for the first problem', () => {
    expect(validatePollAnswers([text], {})).toBe('Comments: answer is required')
    expect(validatePollAnswers([ranking], { r: { a: 1 } })).toBe('Rank these: rank every option')
    expect(validatePollAnswers([text], { t: 'ok' })).toBeNull()
  })
})
