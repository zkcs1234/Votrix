import { describe, expect, test } from 'vitest'
import { validateChangePassword, validateLogin } from '../../src/validators/auth.validator.js'
import { validateInviteVoter, validateResetPassword } from '../../src/validators/email.validator.js'
import { normalizePasswordInput } from '../../src/utils/password.js'

// A password made only of digits is a valid password. It must be accepted whether the
// client sends it as text or (wrongly) as a JSON number, and it must always reach the
// hashing step as a string.
describe('numeric-only passwords', () => {
  test('change password accepts an all-digit new password', () => {
    expect(validateChangePassword({ currentPassword: 'Temp1234', newPassword: '12345678', confirmPassword: '12345678' }))
      .toEqual({ currentPassword: 'Temp1234', newPassword: '12345678' })
  })

  test('a digit-only password sent as a JSON number is converted to text instead of crashing later', () => {
    const result = validateChangePassword({ currentPassword: 'Temp1234', newPassword: 12345678, confirmPassword: 12345678 })
    expect(result.newPassword).toBe('12345678')
    expect(typeof result.newPassword).toBe('string')
  })

  test('the length rule still applies to a numeric password', () => {
    expect(() => validateChangePassword({ currentPassword: 'Temp1234', newPassword: 1234567, confirmPassword: 1234567 }))
      .toThrow('at least 8 characters')
  })

  test('a numeric password still has to match its confirmation', () => {
    expect(() => validateChangePassword({ currentPassword: 'Temp1234', newPassword: '12345678', confirmPassword: '87654321' }))
      .toThrow('do not match')
  })

  test('reset password accepts an all-digit password as text or number', () => {
    expect(validateResetPassword({ token: 't', newPassword: '12345678', confirmPassword: '12345678' }).newPassword).toBe('12345678')
    expect(validateResetPassword({ token: 't', newPassword: 12345678, confirmPassword: 12345678 }).newPassword).toBe('12345678')
  })

  test('login normalizes a numeric password so it compares against the stored hash as text', () => {
    expect(validateLogin({ email: 'a@b.co', password: 12345678 }).password).toBe('12345678')
    expect(validateLogin({ email: 'a@b.co', password: '12345678' }).password).toBe('12345678')
  })

  test('an optional temporary password can be all digits', () => {
    expect(validateInviteVoter({ email: 'a@b.co', temporaryPassword: '12345678' }).temporaryPassword).toBe('12345678')
  })

  test.each([[{}], [[]], [null], [-5], [1.5], [Number.MAX_SAFE_INTEGER + 10]])('%j is not usable as a password', (value) => {
    expect(normalizePasswordInput(value)).toBeUndefined()
    expect(() => validateChangePassword({ currentPassword: 'Temp1234', newPassword: value, confirmPassword: value }))
      .toThrow('All password fields are required')
  })
})
