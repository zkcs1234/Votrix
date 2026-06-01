import { asyncHandler } from '../../src/utils/asyncHandler.js'
import { ApiError } from '../../src/utils/ApiError.js'

describe('AsyncHandler', () => {
  test('should resolve promise without calling next when no error (normal middleware behavior)', async () => {
    const mockReq = {}
    const mockRes = {}
    const mockNext = vi.fn()

    const handler = asyncHandler(async (req, res, next) => {
      return 'success'
    })

    await handler(mockReq, mockRes, mockNext)
    // When async function resolves successfully, next is NOT called
    // (middleware handled the request)
    expect(mockNext).not.toHaveBeenCalled()
  })

  test('should pass error to next middleware on rejection', async () => {
    const mockReq = {}
    const mockRes = {}
    const mockNext = vi.fn()
    const error = new ApiError(500, 'Test error')

    const handler = asyncHandler(async () => {
      throw error
    })

    await handler(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalledWith(error)
  })

  test('should pass thrown ApiError to next middleware', async () => {
    const mockReq = {}
    const mockRes = {}
    const mockNext = vi.fn()

    const handler = asyncHandler(async () => {
      throw new ApiError(400, 'Bad request')
    })

    await handler(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    const passedError = mockNext.mock.calls[0][0]
    expect(passedError.statusCode).toBe(400)
    expect(passedError.message).toBe('Bad request')
  })

  test('should pass regular Error to next middleware', async () => {
    const mockReq = {}
    const mockRes = {}
    const mockNext = vi.fn()

    const handler = asyncHandler(async () => {
      throw new Error('Regular error')
    })

    await handler(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    const passedError = mockNext.mock.calls[0][0]
    expect(passedError.message).toBe('Regular error')
  })
})