import { describe, expect, test } from 'vitest'
import {
  CERTIFICATE_MAX_BYTES,
  CERTIFICATE_MAX_FILES,
  detectCertificateMime,
  validateCertificateFiles,
} from '../../src/services/certificate-storage.service.js'

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(32)])
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)])
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(32)])

const file = (buffer, originalname = 'cert.pdf') => ({ buffer, originalname })

function errorsOf(fn) {
  try {
    fn()
  } catch (err) {
    return err.details?.errors ?? [err.message]
  }
  return []
}

describe('detectCertificateMime', () => {
  test('recognizes PDF, PNG and JPEG by content', () => {
    expect(detectCertificateMime(pdf)).toBe('application/pdf')
    expect(detectCertificateMime(png)).toBe('image/png')
    expect(detectCertificateMime(jpg)).toBe('image/jpeg')
  })

  test('rejects other content and tiny/non-buffer input', () => {
    expect(detectCertificateMime(exe)).toBeNull()
    expect(detectCertificateMime(Buffer.from('%PDF-'))).toBeNull() // < 12 bytes
    expect(detectCertificateMime('%PDF-1.7 string')).toBeNull()
    expect(detectCertificateMime(null)).toBeNull()
  })
})

describe('validateCertificateFiles', () => {
  test('returns verified files with the sniffed MIME, not the claimed one', () => {
    const [out] = validateCertificateFiles([{ ...file(png, 'scan.pdf'), mimetype: 'application/pdf' }])
    expect(out).toMatchObject({ name: 'scan.pdf', mime: 'image/png', size: png.length })
  })

  test('requires at least one file', () => {
    expect(errorsOf(() => validateCertificateFiles([]))).toContain('at least one certificate is required')
    expect(errorsOf(() => validateCertificateFiles(undefined))).toContain('at least one certificate is required')
  })

  test('rejects too many files', () => {
    const many = Array.from({ length: CERTIFICATE_MAX_FILES + 1 }, () => file(pdf))
    expect(errorsOf(() => validateCertificateFiles(many)).join(' ')).toMatch(/at most/)
  })

  test('rejects a disguised executable even when named .pdf', () => {
    expect(errorsOf(() => validateCertificateFiles([file(exe, 'evil.pdf')])).join(' ')).toMatch(/not a PDF, JPEG or PNG/)
  })

  test('rejects empty and oversized files and reports all problems together', () => {
    const big = Buffer.concat([pdf, Buffer.alloc(CERTIFICATE_MAX_BYTES)])
    const errors = errorsOf(() => validateCertificateFiles([file(Buffer.alloc(0), 'a.pdf'), file(big, 'b.pdf'), file(exe, 'c.pdf')]))
    expect(errors).toHaveLength(3)
  })
})
