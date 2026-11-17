import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ImageUploadField from './ImageUploadField'

const pick = (container, file) => {
  const input = container.querySelector('input[type="file"]')
  fireEvent.change(input, { target: { files: [file] } })
  return input
}

afterEach(() => vi.restoreAllMocks())

describe('ImageUploadField', () => {
  it('explains an oversized image next to the field instead of a blocking browser alert', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onFileSelect = vi.fn()
    const { container } = render(<ImageUploadField label="Photo" onFileSelect={onFileSelect} />)
    const big = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
    pick(container, big)

    expect(screen.getByRole('alert')).toHaveTextContent('Image must be 5 MB or smaller.')
    expect(alert).not.toHaveBeenCalled()
    expect(onFileSelect).not.toHaveBeenCalled()
  })

  it('rejects a file that is not a supported image type', () => {
    const onFileSelect = vi.fn()
    const { container } = render(<ImageUploadField label="Photo" onFileSelect={onFileSelect} />)
    pick(container, new File(['x'], 'notes.pdf', { type: 'application/pdf' }))

    expect(screen.getByRole('alert')).toHaveTextContent('"notes.pdf" is not a supported image')
    expect(onFileSelect).not.toHaveBeenCalled()
  })

  it('clears the message and accepts a good image', () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    const onFileSelect = vi.fn()
    const { container } = render(<ImageUploadField label="Photo" onFileSelect={onFileSelect} />)
    pick(container, new File(['x'], 'bad.pdf', { type: 'application/pdf' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    const good = new File(['x'], 'ok.png', { type: 'image/png' })
    pick(container, good)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onFileSelect).toHaveBeenCalledWith(good)
  })
})
