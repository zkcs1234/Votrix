import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AlertConfigPage from './AlertConfigPage'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: { getAlertConfig: vi.fn(), updateAlertConfig: vi.fn() },
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

const config = () => ({
  failedEmailDelivery: { enabled: true, threshold: 5 },
  eventCompletion: { enabled: true },
  suspiciousActivity: { enabled: false, failedLoginThreshold: 10 },
})

beforeEach(() => {
  vi.resetAllMocks()
  adminService.getAlertConfig.mockResolvedValue({ data: { config: config() } })
  adminService.updateAlertConfig.mockResolvedValue({ data: {} })
})

describe('AlertConfigPage threshold validation', () => {
  it('lets the threshold box be cleared and flags it instead of silently saving 0', async () => {
    render(<AlertConfigPage />)
    const field = await screen.findByLabelText(/Threshold \(count\)/)
    const save = screen.getByRole('button', { name: 'Save alerts' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(field, { target: { value: '' } })
    expect(field).toHaveValue(null) // really empty, not coerced to 0
    expect(await screen.findByText('Threshold (count) must be a valid number')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(save).toBeDisabled()
    expect(screen.getByText(/Fix the threshold for/)).toBeInTheDocument()

    fireEvent.change(field, { target: { value: '8' } })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    await waitFor(() => expect(adminService.updateAlertConfig).toHaveBeenCalledWith(
      expect.objectContaining({ failedEmailDelivery: { enabled: true, threshold: 8 } }),
    ))
  })

  it('rejects zero, fractions and values above the server maximum', async () => {
    render(<AlertConfigPage />)
    const field = await screen.findByLabelText(/Threshold \(count\)/)
    for (const value of ['0', '2.5', '100001']) {
      fireEvent.change(field, { target: { value } })
      expect(await screen.findByText(/must be a whole number from 1 to 100000/)).toBeInTheDocument()
    }
  })

  it('ignores the threshold of an alert that is switched off', async () => {
    render(<AlertConfigPage />)
    await screen.findByLabelText(/Threshold \(count\)/)
    // Failed-login alert is off, so it has no threshold box and cannot block saving.
    expect(screen.queryByLabelText(/Failed login threshold/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save alerts' })).toBeEnabled()
  })
})
