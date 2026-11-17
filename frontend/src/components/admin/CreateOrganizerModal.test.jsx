import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CreateOrganizerModal from './CreateOrganizerModal'
import { adminService } from '@/services/admin.service'

vi.mock('axios', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { csrfToken: 'tok' } }) } }))
vi.mock('@/services/admin.service', () => ({
  adminService: { getPrograms: vi.fn(), createOrganizer: vi.fn(), updateOrganizer: vi.fn() },
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

const renderModal = (props = {}) =>
  render(<CreateOrganizerModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} {...props} />)

function fillProfile() {
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'org@example.com' } })
  fireEvent.change(screen.getByLabelText(/^Organizer name/), { target: { value: 'Jo Reyes' } })
  fireEvent.change(screen.getByLabelText(/^Position/), { target: { value: 'Adviser' } })
  fireEvent.change(screen.getByLabelText(/^Organization name/), { target: { value: 'SSG' } })
  fireEvent.change(screen.getByLabelText(/^Organization type/), { target: { value: 'Co-curricular' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  adminService.getPrograms.mockResolvedValue({ data: { programs: ['BSIT', 'BSCS'] } })
  adminService.createOrganizer.mockResolvedValue({ data: { email: { sent: true } } })
})

describe('CreateOrganizerModal live validation', () => {
  it('flags an invalid email and an empty name while typing, and blocks the button', async () => {
    renderModal()
    const email = screen.getByLabelText(/^Email/)
    fireEvent.change(email, { target: { value: 'nope' } })
    fireEvent.blur(email)
    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument()

    const name = screen.getByLabelText(/^Organizer name/)
    fireEvent.change(name, { target: { value: '  ' } })
    fireEvent.blur(name)
    expect(await screen.findByText('Organizer name is required')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
    expect(adminService.createOrganizer).not.toHaveBeenCalled()
  })

  it('creates an all-programs organizer once the form is valid', async () => {
    const onSuccess = vi.fn()
    renderModal({ onSuccess })
    fillProfile()
    fireEvent.click(screen.getByLabelText(/All programs/))

    const submit = screen.getByRole('button', { name: 'Create account' })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(adminService.createOrganizer).toHaveBeenCalledWith({
      organizerName: 'Jo Reyes',
      position: 'Adviser',
      organizationName: 'SSG',
      organizationType: 'Co-curricular',
      scopeType: 'all',
      programs: [],
      email: 'org@example.com',
      sendEmail: true,
    })
  })

  it('keeps a scoped organizer blocked until a program is picked', async () => {
    renderModal()
    fillProfile()
    fireEvent.click(screen.getByLabelText(/Selected programs/))
    await screen.findByRole('button', { name: 'BSIT' })

    const submit = screen.getByRole('button', { name: 'Create account' })
    expect(await screen.findByText('Select at least one program to save a scoped organizer.')).toBeInTheDocument()
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'BSIT' }))
    await waitFor(() => expect(submit).toBeEnabled())
  })

  it('puts a server "email already exists" rejection on the Email field', async () => {
    adminService.createOrganizer.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 409, data: { message: 'An account with this email already exists' } } }),
    )
    renderModal()
    fillProfile()
    fireEvent.click(screen.getByLabelText(/All programs/))
    const submit = screen.getByRole('button', { name: 'Create account' })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    await waitFor(() => expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('An account with this email already exists')).toBeInTheDocument()
  })

  it('edit mode locks the email and saves without it being validated', async () => {
    adminService.updateOrganizer.mockResolvedValue({ data: {} })
    const organizer = {
      id: 'o1',
      email: 'org@example.com',
      organizer_name: 'Jo Reyes',
      position: 'Adviser',
      organization_name: 'SSG',
      organization_type_display: 'Co-curricular',
      scope: { scopeType: 'all', programs: [] },
    }
    renderModal({ organizer })
    expect(screen.getByLabelText(/^Email/)).toBeDisabled()

    const submit = screen.getByRole('button', { name: 'Save changes' })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)
    await waitFor(() => expect(adminService.updateOrganizer).toHaveBeenCalledWith('o1', {
      organizerName: 'Jo Reyes',
      position: 'Adviser',
      organizationName: 'SSG',
      organizationType: 'Co-curricular',
      scopeType: 'all',
      programs: [],
    }))
  })
})
