import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import JudgesPanel from './JudgesPanel'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: { getJudges: vi.fn(), createJudge: vi.fn(), updateJudge: vi.fn() },
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

async function openAddJudge() {
  render(<MemoryRouter><JudgesPanel /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Add Judge/ }))
  await screen.findByRole('dialog')
}

beforeEach(() => {
  vi.resetAllMocks()
  adminService.getJudges.mockResolvedValue({ data: { judges: [], total: 0, page: 1, limit: 50 } })
  adminService.createJudge.mockResolvedValue({ data: { email: { sent: true } } })
})

describe('Add Judge form', () => {
  it('flags bad input while typing and blocks submit', async () => {
    await openAddJudge()
    const email = screen.getByLabelText(/^Email/)
    fireEvent.change(email, { target: { value: 'judge@' } })
    fireEvent.blur(email)
    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument()

    const first = screen.getByLabelText(/^First name/)
    fireEvent.change(first, { target: { value: ' ' } })
    fireEvent.blur(first)
    expect(await screen.findByText('First name is required')).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('button[type="submit"]')).toBeDisabled()
    expect(adminService.createJudge).not.toHaveBeenCalled()
  })

  it('submits trimmed values once valid', async () => {
    await openAddJudge()
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: ' judge@example.com ' } })
    fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: 'Judy' } })
    fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: 'One' } })

    const submit = screen.getByRole('dialog').querySelector('button[type="submit"]')
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    await waitFor(() => expect(adminService.createJudge).toHaveBeenCalledWith({
      email: 'judge@example.com', firstName: 'Judy', lastName: 'One', expertise: '', title: '', affiliation: '',
    }))
  })
})
