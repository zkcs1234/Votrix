import { ApiError } from '../../src/utils/ApiError.js'

describe('ApiError', () => {
  test('should create error with status code and message', () => {
    const error = new ApiError(400, 'Bad request')
    expect(error.statusCode).toBe(400)
    expect(error.message).toBe('Bad request')
    expect(error.isOperational).toBe(true)
  })

  test('should include details when provided', () => {
    const details = { field: 'email', reason: 'invalid format' }
    const error = new ApiError(400, 'Validation failed', details)
    expect(error.details).toEqual(details)
  })

  test('should have correct stack trace', () => {
    const error = new ApiError(500, 'Internal server error')
    expect(error.stack).toBeDefined()
  })

  test('should be instanceof Error', () => {
    const error = new ApiError(404, 'Not found')
    expect(error).toBeInstanceOf(Error)
  })
})