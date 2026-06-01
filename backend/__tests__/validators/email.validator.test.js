import { ApiError } from '../../src/utils/ApiError.js'
import {
  validateEmailField,
  validateInviteVoter,
  validateEventNotification,
  validateForgotPassword,
  validateResetPassword
} from '../../src/validators/email.validator.js'

describe('Email Validators', () => {
  describe('validateEmailField', () => {
    test('should return trimmed lowercase email for valid input', () => {
      const result = validateEmailField('  TEST@Example.COM  ')
      expect(result).toBe('test@example.com')
    })

    test('should throw error when email is missing', () => {
      expect(() => validateEmailField('')).toThrow(ApiError)
    })

    test('should throw error when email is only whitespace', () => {
      expect(() => validateEmailField('   ')).toThrow(ApiError)
    })

    test('should throw error for invalid email format', () => {
      expect(() => validateEmailField('invalid-email')).toThrow(ApiError)
    })

    test('should throw error for email without @', () => {
      expect(() => validateEmailField('testexample.com')).toThrow(ApiError)
    })

    test('should throw error for email without domain', () => {
      expect(() => validateEmailField('test@')).toThrow(ApiError)
    })
  })

  describe('validateInviteVoter', () => {
    test('should return sanitized data for valid input without password', () => {
      const result = validateInviteVoter({ email: '  VOTER@Example.COM  ' })
      expect(result).toEqual({ email: 'voter@example.com', temporaryPassword: undefined })
    })

    test('should return data with password when provided', () => {
      const result = validateInviteVoter({
        email: 'voter@example.com',
        temporaryPassword: 'password123'
      })
      expect(result).toEqual({ email: 'voter@example.com', temporaryPassword: 'password123' })
    })

    test('should throw error when email is missing', () => {
      expect(() => validateInviteVoter({})).toThrow(ApiError)
    })

    test('should throw error for invalid email format', () => {
      expect(() => validateInviteVoter({ email: 'invalid' })).toThrow(ApiError)
    })

    test('should throw error when temporaryPassword is less than 8 characters', () => {
      expect(() => validateInviteVoter({
        email: 'voter@example.com',
        temporaryPassword: 'short'
      })).toThrow(ApiError)
    })
  })

  describe('validateEventNotification', () => {
    test('should return message for valid input', () => {
      const result = validateEventNotification({ message: '  Test message  ' })
      expect(result).toEqual({ message: 'Test message' })
    })

    test('should throw error when message is missing', () => {
      expect(() => validateEventNotification({})).toThrow(ApiError)
    })

    test('should throw error when message is empty', () => {
      expect(() => validateEventNotification({ message: '' })).toThrow(ApiError)
    })

    test('should throw error when message is whitespace only', () => {
      expect(() => validateEventNotification({ message: '   ' })).toThrow(ApiError)
    })

    test('should throw error when message exceeds 2000 characters', () => {
      const longMessage = 'a'.repeat(2001)
      expect(() => validateEventNotification({ message: longMessage })).toThrow(ApiError)
    })

    test('should allow message at exactly 2000 characters', () => {
      const message = 'a'.repeat(2000)
      const result = validateEventNotification({ message })
      expect(result.message).toHaveLength(2000)
    })
  })

  describe('validateForgotPassword', () => {
    test('should return sanitized email for valid input', () => {
      const result = validateForgotPassword({ email: '  TEST@Example.COM  ' })
      expect(result).toEqual({ email: 'test@example.com' })
    })

    test('should throw error when email is missing', () => {
      expect(() => validateForgotPassword({})).toThrow(ApiError)
    })

    test('should throw error for invalid email format', () => {
      expect(() => validateForgotPassword({ email: 'invalid' })).toThrow(ApiError)
    })
  })

  describe('validateResetPassword', () => {
    test('should return token and password for valid input', () => {
      const result = validateResetPassword({
        token: '  reset-token-123  ',
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123'
      })
      expect(result).toEqual({ token: 'reset-token-123', newPassword: 'newPassword123' })
    })

    test('should throw error when token is missing', () => {
      expect(() => validateResetPassword({
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123'
      })).toThrow(ApiError)
    })

    test('should throw error when token is empty', () => {
      expect(() => validateResetPassword({
        token: '   ',
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123'
      })).toThrow(ApiError)
    })

    test('should throw error when newPassword is less than 8 characters', () => {
      expect(() => validateResetPassword({
        token: 'reset-token',
        newPassword: 'short',
        confirmPassword: 'short'
      })).toThrow(ApiError)
    })

    test('should throw error when passwords do not match', () => {
      expect(() => validateResetPassword({
        token: 'reset-token',
        newPassword: 'newPassword123',
        confirmPassword: 'differentPassword'
      })).toThrow(ApiError)
    })
  })
})