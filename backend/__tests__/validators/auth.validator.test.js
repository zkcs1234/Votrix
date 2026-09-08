import { ApiError } from '../../src/utils/ApiError.js'
import {
  validateLogin,
  validateChangePassword,
  validateCreateOrganizer,
} from '../../src/validators/auth.validator.js'

const TEST_CREDENTIALS = {
  password: 'password123',
  oldPassword: 'oldPassword123',
  newPassword: 'newPassword123',
  differentPassword: 'differentPassword',
  shortPassword: 'short',
}

describe('Auth Validators', () => {
  describe('validateLogin', () => {
    test('should return sanitized email and password for valid input', () => {
      const result = validateLogin({ email: '  TEST@Example.COM  ', password: TEST_CREDENTIALS.password })
      expect(result).toEqual({ email: 'test@example.com', password: TEST_CREDENTIALS.password, remember: false })
    })

    test('should handle remember flag', () => {
      const result = validateLogin({ email: 'test@example.com', password: TEST_CREDENTIALS.password, remember: true })
      expect(result.remember).toBe(true)
    })

    test('should throw error when email is missing', () => {
      expect(() => validateLogin({ password: TEST_CREDENTIALS.password })).toThrow(ApiError)
    })

    test('should throw error when password is missing', () => {
      expect(() => validateLogin({ email: 'test@example.com' })).toThrow(ApiError)
    })

    test('should throw error when email is empty', () => {
      expect(() => validateLogin({ email: '   ', password: TEST_CREDENTIALS.password })).toThrow(ApiError)
    })

    test('should throw error when body is null', () => {
      expect(() => validateLogin(null)).toThrow(ApiError)
    })

    test('should throw error for invalid email format', () => {
      expect(() => validateLogin({ email: 'invalid-email', password: TEST_CREDENTIALS.password })).toThrow(ApiError)
    })

    test('should throw error for email without domain', () => {
      expect(() => validateLogin({ email: 'test@', password: TEST_CREDENTIALS.password })).toThrow(ApiError)
    })
  })

  describe('validateChangePassword', () => {
    test('should return passwords for valid input', () => {
      const result = validateChangePassword({
        currentPassword: TEST_CREDENTIALS.oldPassword,
        newPassword: TEST_CREDENTIALS.newPassword,
        confirmPassword: TEST_CREDENTIALS.newPassword,
      })
      expect(result).toEqual({
        currentPassword: TEST_CREDENTIALS.oldPassword,
        newPassword: TEST_CREDENTIALS.newPassword,
      })
    })

    test('should throw error when currentPassword is missing', () => {
      expect(() => validateChangePassword({
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123'
      })).toThrow(ApiError)
    })

    test('should throw error when newPassword is missing', () => {
      expect(() => validateChangePassword({
        currentPassword: TEST_CREDENTIALS.oldPassword,
        confirmPassword: TEST_CREDENTIALS.newPassword,
      })).toThrow(ApiError)
    })

    test('should throw error when passwords do not match', () => {
      expect(() => validateChangePassword({
        currentPassword: TEST_CREDENTIALS.oldPassword,
        newPassword: TEST_CREDENTIALS.newPassword,
        confirmPassword: TEST_CREDENTIALS.differentPassword,
      })).toThrow(ApiError)
    })

    test('should throw error when newPassword is less than 8 characters', () => {
      expect(() => validateChangePassword({
        currentPassword: TEST_CREDENTIALS.oldPassword,
        newPassword: TEST_CREDENTIALS.shortPassword,
        confirmPassword: TEST_CREDENTIALS.shortPassword,
      })).toThrow(ApiError)
    })
  })

  describe('validateCreateOrganizer', () => {
    // The temporary password is generated server-side, so the validator only
    // accepts and sanitizes the email — any client-supplied password is ignored.
    test('should return only the sanitized email for valid input', () => {
      const result = validateCreateOrganizer({
        email: '  ORGANIZER@Example.COM  ',
      })
      expect(result).toEqual({ email: 'organizer@example.com' })
    })

    test('should ignore any client-supplied password', () => {
      const result = validateCreateOrganizer({
        email: 'organizer@example.com',
        password: TEST_CREDENTIALS.password,
      })
      expect(result).toEqual({ email: 'organizer@example.com' })
    })

    test('should throw error when email is missing', () => {
      expect(() => validateCreateOrganizer({})).toThrow(ApiError)
    })

    test('should throw error for invalid email format', () => {
      expect(() => validateCreateOrganizer({
        email: 'invalid-email',
      })).toThrow(ApiError)
    })
  })
})