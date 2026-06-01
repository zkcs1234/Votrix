import { sanitizeString, sanitizeEmail } from '../../src/utils/sanitize.js'

describe('Sanitize Utilities', () => {
  describe('sanitizeString', () => {
    test('should trim and return string unchanged when no HTML', () => {
      const result = sanitizeString('  hello world  ')
      expect(result).toBe('hello world')
    })

    test('should remove HTML tags', () => {
      const result = sanitizeString('<script>alert("xss")</script>hello')
      expect(result).toBe('alert("xss")hello')
    })

    test('should remove null bytes', () => {
      const result = sanitizeString('hello\x00world')
      expect(result).toBe('helloworld')
    })

    test('should truncate string if exceeds maxLength', () => {
      const longString = 'a'.repeat(100)
      const result = sanitizeString(longString, 50)
      expect(result).toHaveLength(50)
    })

    test('should return original value if null', () => {
      const result = sanitizeString(null)
      expect(result).toBeNull()
    })

    test('should return original value if undefined', () => {
      const result = sanitizeString(undefined)
      expect(result).toBeUndefined()
    })

    test('should return original value if not a string', () => {
      const result = sanitizeString(123)
      expect(result).toBe(123)
    })

    test('should handle empty string', () => {
      const result = sanitizeString('')
      expect(result).toBe('')
    })
  })

  describe('sanitizeEmail', () => {
    test('should convert email to lowercase', () => {
      const result = sanitizeEmail('TEST@EXAMPLE.COM')
      expect(result).toBe('test@example.com')
    })

    test('should trim whitespace', () => {
      const result = sanitizeEmail('  test@example.com  ')
      expect(result).toBe('test@example.com')
    })

    test('should return original value if not a string', () => {
      const result = sanitizeEmail(null)
      expect(result).toBeNull()
    })

    test('should return undefined if undefined', () => {
      const result = sanitizeEmail(undefined)
      expect(result).toBeUndefined()
    })

    test('should handle empty string', () => {
      const result = sanitizeEmail('')
      expect(result).toBe('')
    })
  })
})