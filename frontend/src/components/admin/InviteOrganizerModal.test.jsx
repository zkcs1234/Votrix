import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import InviteOrganizerModal from './InviteOrganizerModal'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: { createOrganizerInvitation: vi.fn(), getSystemSettings: vi.fn() },
}))

const created = (email = { sent: true }) => ({
  data: {
    invitation: { id: 'inv-1', email: 'ada@example.com' },
    email,
    applyUrl: 'https://votrix.test/organizer/apply/abc123',
  },
})

const renderModal = (props = {}) =>
  render(<InviteOrganizerModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} {...props} />)

// The button enables itself once every field is valid.
const send = async () => {
  const button = screen.getByRole('button', { name: 'Send invitation' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
}

beforeEach(() => {
  vi.resetAllMocks()
  adminService.createOrganizerInvitation.mockResolvedValue(created())
  adminService.getSystemSettings.mockResolvedValue({ data: { settings: [], effective: { invitationExpiryDays: 7 } } })
})

describe('InviteOrganizerModal', () => {
  it('asks only for email, expiry and an optional note', () => {
    renderModal()
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument()
    expect(screen.getByLabelText('Link expires after')).toHaveValue('7')
    expect(screen.getByLabelText(/Note to the applicant/)).toBeInTheDocument()
    for (const removed of [/organizer name/i, /position/i, /organization name/i, /organization type/i, /access scope/i]) {
      expect(screen.queryByLabelText(removed)).not.toBeInTheDocument()
    }
  })

  it('sends the trimmed email, chosen expiry and note, then shows the one-time link', async () => {
    const onSuccess = vi.fn()
    renderModal({ onSuccess })
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: '  ada@example.com ' } })
    fireEvent.change(screen.getByLabelText('Link expires after'), { target: { value: '14' } })
    fireEvent.change(screen.getByLabelText(/Note to the applicant/), { target: { value: 'Hello' } })
    await send()

    expect(await screen.findByLabelText('Application link')).toHaveValue('https://votrix.test/organizer/apply/abc123')
    expect(adminService.createOrganizerInvitation).toHaveBeenCalledWith({
      email: 'ada@example.com',
      expiresInDays: 14,
      note: 'Hello',
    })
    expect(screen.getByText('The invitation email was sent.')).toBeInTheDocument()
    expect(onSuccess).toHaveBeenCalled()
  })

  describe('default expiry from System settings', () => {
    const withDefault = (days) =>
      adminService.getSystemSettings.mockResolvedValue({ data: { settings: [], effective: { invitationExpiryDays: days } } })

    it('preselects the configured default', async () => {
      withDefault(21)
      renderModal()
      await waitFor(() => expect(screen.getByLabelText('Link expires after')).toHaveValue('21'))
      expect(screen.getByRole('option', { name: '21 days (default)' })).toBeInTheDocument()
      for (const days of ['1 day', '3 days', '14 days', '30 days']) expect(screen.getByRole('option', { name: days })).toBeInTheDocument()
    })

    it('marks the default even when it is one of the usual choices', async () => {
      withDefault(14)
      renderModal()
      await waitFor(() => expect(screen.getByLabelText('Link expires after')).toHaveValue('14'))
      expect(screen.getAllByRole('option').filter((o) => /default/.test(o.textContent))).toHaveLength(1)
    })

    it('sends the default length when the admin does not change it', async () => {
      withDefault(21)
      renderModal()
      await waitFor(() => expect(screen.getByLabelText('Link expires after')).toHaveValue('21'))
      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } })
      await send()
      await screen.findByLabelText('Application link')
      expect(adminService.createOrganizerInvitation.mock.calls[0][0].expiresInDays).toBe(21)
    })

    it('does not overwrite a length the admin already picked when the default arrives late', async () => {
      let resolve
      adminService.getSystemSettings.mockReturnValue(new Promise((r) => { resolve = r }))
      renderModal()
      fireEvent.change(screen.getByLabelText('Link expires after'), { target: { value: '3' } })
      resolve({ data: { settings: [], effective: { invitationExpiryDays: 21 } } })
      await screen.findByRole('option', { name: '21 days (default)' })
      expect(screen.getByLabelText('Link expires after')).toHaveValue('3')
    })

    it('falls back to 7 days if the setting cannot be read', async () => {
      adminService.getSystemSettings.mockRejectedValue(new Error('offline'))
      renderModal()
      await waitFor(() => expect(adminService.getSystemSettings).toHaveBeenCalled())
      expect(screen.getByLabelText('Link expires after')).toHaveValue('7')
    })
  })

  it('omits an empty note', async () => {
    renderModal()
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } })
    await send()

    await screen.findByLabelText('Application link')
    expect(adminService.createOrganizerInvitation.mock.calls[0][0].note).toBeUndefined()
  })

  it('tells the admin to share the link by hand when the email was not delivered', async () => {
    adminService.createOrganizerInvitation.mockResolvedValue(created({ sent: false, skipped: true, reason: 'Email service not configured' }))
    renderModal()
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } })
    await send()

    expect(await screen.findByText(/Email was not sent: Email service not configured/)).toBeInTheDocument()
    expect(screen.getByLabelText('Application link')).toBeInTheDocument()
  })

  it('validates the email and note while typing, before any submit', async () => {
    renderModal()
    const email = screen.getByLabelText(/^Email/)
    fireEvent.change(email, { target: { value: 'ada@' } })
    fireEvent.blur(email)
    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled()

    const note = screen.getByLabelText(/Note to the applicant/)
    fireEvent.change(note, { target: { value: 'n'.repeat(501) } })
    fireEvent.blur(note)
    expect(await screen.findByText('Note must be 500 characters or fewer')).toBeInTheDocument()
    expect(screen.getByText('501/500')).toBeInTheDocument()
    expect(adminService.createOrganizerInvitation).not.toHaveBeenCalled()
  })

  it('shows server validation errors and stays on the form', async () => {
    adminService.createOrganizerInvitation.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 409, data: { message: 'An account with this email already exists' } } }),
    )
    renderModal()
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } })
    await send()

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument()
    expect(screen.queryByLabelText('Application link')).not.toBeInTheDocument()
  })
})
