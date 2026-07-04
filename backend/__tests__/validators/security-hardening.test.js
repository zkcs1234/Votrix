import { describe, expect, test } from 'vitest'
import { ApiError } from '../../src/utils/ApiError.js'
import { validateCreateEvent } from '../../src/validators/election.validator.js'
import { validatePollAnswers } from '../../src/validators/polling.validator.js'

describe('Security hardening validators', () => {
  test('rejects invalid event status values', () => {
    expect(() => validateCreateEvent({ title: 'Demo Event', status: 'invalid-status' })).toThrow(
      /status/i,
    )
  })

  test('rejects oversized poll answer payloads', () => {
    const tooManyKeys = Object.fromEntries(
      Array.from({ length: 201 }, (_, index) => [`q${index}`, 'value']),
    )
    expect(() => validatePollAnswers({ answers: tooManyKeys })).toThrow(ApiError)

    const oversizedValue = 'a'.repeat(10_001)
    expect(() => validatePollAnswers({ answers: { q1: oversizedValue } })).toThrow(ApiError)
  })
})
