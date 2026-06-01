import { ApiError } from '../../src/utils/ApiError.js'
import {
  validateAdminLogin,
  validateEmailLogin,
  validateChangePassword,
  validateCreateOrganizer
} from '../../src/validators/auth.validator.js'

describe('Auth Validators', () => {
  describe('validateAdminLogin', () => {
    test('should return sanitized credentials for valid input', () => {
      const result = validateAdminLogin({ username: '  admin  ', password: 'password123' })
      expect(result).toEqual({ username: 'admin', password: 'password123' })
    })

    test('should throw error when username is missing', () => {
      expect(() => validateAdminLogin({ password: 'password123' })).toThrow(ApiError)
    })

    test('should throw error when password is missing', () => {
      expect(() => validateAdminLogin({ username: 'admin' })).toThrow(ApiError)
    })

    test('should throw error when username is empty', () => {
      expect(() => validateAdminLogin({ username: '   ', password: 'password123' })).toThrow(ApiError)
    })

    test('should throw error when body is null', () => {
      expect(() => validateAdminLogin(null)).toThrow(ApiError)
    })
  })

  describe('validateEmailLogin', () => {
    test('should return sanitized email and password for valid input', () => {
      const result = validateEmailLogin({ email: '  TEST@Example.COM  ', password: 'password123' })
      expect(result).toEqual({ email: 'test@example.com', password: 'password123' })
    })

    test('should throw error when email is missing', () => {
      expect(() => validateEmailLogin({ password: 'password123' })).toThrow(ApiError)
    })

    test('should throw error when password is missing', () => {
      expect(() => validateEmailLogin({ email: 'test@example.com' })).toThrow(ApiError)
    })

    test('should throw error for invalid email format', () => {
      expect(() => validateEmailLogin({ email: 'invalid-email', password: 'password123' })).toThrow(ApiError)
    })

    test('should throw error for email without domain', () => {
      expect(() => validateEmailLogin({ email: 'test@', password: 'password123' })).toThrow(ApiError)
    })
  })

  describe('validateChangePassword', () => {
    test('should return passwords for valid input', () => {
      const result = validateChangePassword({
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123'
      })
      expect(result).toEqual({
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123'
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
        currentPassword: 'oldPassword123',
        confirmPassword: 'newPassword123'
      })).toThrow(ApiError)
    })

    test('should throw error when passwords do not match', () => {
      expect(() => validateChangePassword({
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123',
        confirmPassword: 'differentPassword'
      })).toThrow(ApiError)
    })

    test('should throw error when newPassword is less than 8 characters', () => {
      expect(() => validateChangePassword({
        currentPassword: 'oldPassword123',
        newPassword: 'short',
        confirmPassword: 'short'
      })).toThrow(ApiError)
    })
  })

  describe('validateCreateOrganizer', () => {
    test('should return sanitized data for valid input', () => {
      const result = validateCreateOrganizer({
        email: '  ORGANIZER@Example.COM  ',
        password: 'password123'
      })
      expect(result).toEqual({ email: 'organizer@example.com', password: 'password123' })
    })

    test('should throw error when email is missing', () => {
      expect(() => validateCreateOrganizer({ password: 'password123' })).toThrow(ApiError)
    })

    test('should throw error when password is less than 8 characters', () => {
      expect(() => validateCreateOrganizer({
        email: 'test@example.com',
        password: 'short'
      })).toThrow(ApiError)
    })

    test('should throw error for invalid email format', () => {
      expect(() => validateCreateOrganizer({
        email: 'invalid-email',
        password: 'password123'
      })).toThrow(ApiError)
    })
  })
})