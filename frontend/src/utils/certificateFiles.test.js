import { describe, expect, it } from 'vitest'
import { CERTIFICATE_MAX_BYTES, CERTIFICATE_MAX_FILES, addCertificateFiles, formatFileSize } from './certificateFiles'

const file = (name, size = 1024, type = 'application/pdf') => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('addCertificateFiles', () => {
  it('accepts PDF, JPEG and PNG', () => {
    const { files, errors } = addCertificateFiles([], [file('a.pdf'), file('b.jpg', 10, 'image/jpeg'), file('c.png', 10, 'image/png')])
    expect(files).toHaveLength(3)
    expect(errors).toEqual([])
  })

  it('falls back to the extension when the browser reports no type', () => {
    expect(addCertificateFiles([], [file('scan.PDF', 10, '')]).files).toHaveLength(1)
  })

  it('refuses other types, empty files and oversized files with a message each', () => {
    const { files, errors } = addCertificateFiles([], [
      file('run.exe', 10, 'application/x-msdownload'),
      file('empty.pdf', 0),
      file('big.pdf', CERTIFICATE_MAX_BYTES + 1),
    ])
    expect(files).toEqual([])
    expect(errors).toHaveLength(3)
    expect(errors.join(' ')).toMatch(/not a PDF, JPEG or PNG/)
    expect(errors.join(' ')).toMatch(/is empty/)
    expect(errors.join(' ')).toMatch(/larger than 8 MB/)
  })

  it('ignores duplicates and caps the selection', () => {
    const first = file('a.pdf')
    expect(addCertificateFiles([first], [file('a.pdf')]).errors[0]).toMatch(/already added/)

    const many = Array.from({ length: CERTIFICATE_MAX_FILES + 2 }, (_, i) => file(`f${i}.pdf`, 100 + i))
    const { files, errors } = addCertificateFiles([], many)
    expect(files).toHaveLength(CERTIFICATE_MAX_FILES)
    expect(errors.some((e) => /at most/.test(e))).toBe(true)
  })

  it('does not mutate the current selection', () => {
    const current = [file('a.pdf')]
    addCertificateFiles(current, [file('b.pdf', 5)])
    expect(current).toHaveLength(1)
  })
})

describe('formatFileSize', () => {
  it('formats KB and MB', () => {
    expect(formatFileSize(10)).toBe('1 KB')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
