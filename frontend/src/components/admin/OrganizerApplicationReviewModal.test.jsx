import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import OrganizerApplicationReviewModal from './OrganizerApplicationReviewModal'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: {
    getOrganizerApplication: vi.fn(),
    getPrograms: vi.fn(),
    approveOrganizerApplication: vi.fn(),
    declineOrganizerApplication: vi.fn(),
  },
}))

const application = (overrides = {}) => ({
  id: 'app-1',
  email: 'ada@example.com',
  organizerName: 'Ada Lovelace',
  position: 'President',
  organizationName: 'Computing Society',
  organizationType: 'Co-curricular',
  requestedScope: { scopeType: 'scoped', programs: ['BSCS'] },
  status: 'pending',
  declineReason: null,
  certificateCount: 1,
  certificates: [{ name: 'cert.pdf', mime: 'application/pdf', size: 2048, url: 'https://signed.example/cert.pdf' }],
  ...overrides,
})

const renderModal = (app = application(), props = {}) => {
  adminService.getOrganizerApplication.mockResolvedValue({ data: { application: app } })
  return render(<OrganizerApplicationReviewModal applicationId="app-1" onClose={vi.fn()} onDone={vi.fn()} {...props} />)
}

beforeEach(() => {
  vi.resetAllMocks()
  adminService.getPrograms.mockResolvedValue({ data: { programs: ['BSCS', 'BSIT'] } })
  adminService.approveOrganizerApplication.mockResolvedValue({ data: { email: { sent: true } } })
  adminService.declineOrganizerApplication.mockResolvedValue({ data: {} })
})

describe('OrganizerApplicationReviewModal', () => {
  it('shows the applicant details and opens certificates through signed links', async () => {
    renderModal()
    expect(await screen.findByLabelText('Organizer name')).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText('Organization name')).toHaveValue('Computing Society')
    const link = screen.getByRole('link', { name: /Open/ })
    expect(link).toHaveAttribute('href', 'https://signed.example/cert.pdf')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('approves with the applicant values by default', async () => {
    const onDone = vi.fn()
    renderModal(application(), { onDone })
    fireEvent.click(await screen.findByRole('button', { name: /Approve/ }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(adminService.approveOrganizerApplication).toHaveBeenCalledWith('app-1', {
      organizerName: 'Ada Lovelace',
      position: 'President',
      organizationName: 'Computing Society',
      organizationType: 'Co-curricular',
      scopeType: 'scoped',
      programs: ['BSCS'],
    })
  })

  it('sends the admin’s corrections, including a changed scope', async () => {
    renderModal()
    fireEvent.change(await screen.findByLabelText('Position'), { target: { value: 'Adviser' } })
    fireEvent.click(screen.getByRole('button', { name: 'BSIT' }))
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }))

    await waitFor(() => expect(adminService.approveOrganizerApplication).toHaveBeenCalled())
    expect(adminService.approveOrganizerApplication.mock.calls[0][1]).toMatchObject({
      position: 'Adviser',
      programs: ['BSCS', 'BSIT'],
    })
  })

  it('will not approve a scoped request with no program selected', async () => {
    renderModal()
    await screen.findByLabelText('Position')
    fireEvent.click(screen.getByRole('button', { name: 'BSCS' })) // deselect the only program

    expect(screen.getByRole('button', { name: /Approve/ })).toBeDisabled()
  })

  it('shows server errors from approval and does not close', async () => {
    adminService.approveOrganizerApplication.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 409, data: { message: 'conflict', details: { errors: ['An account with this email already exists'] } } } }),
    )
    const onDone = vi.fn()
    renderModal(application(), { onDone })
    fireEvent.click(await screen.findByRole('button', { name: /Approve/ }))

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('requires a reason before declining, then sends it trimmed', async () => {
    const onDone = vi.fn()
    renderModal(application(), { onDone })
    fireEvent.click(await screen.findByRole('button', { name: 'Decline…' }))

    const confirm = screen.getByRole('button', { name: 'Decline application' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason for declining'), { target: { value: '  Certificates unreadable ' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(adminService.declineOrganizerApplication).toHaveBeenCalledWith('app-1', 'Certificates unreadable')
    expect(adminService.approveOrganizerApplication).not.toHaveBeenCalled()
  })

  it('is read-only once reviewed: no actions, fields disabled, reason shown', async () => {
    renderModal(application({ status: 'declined', declineReason: 'Missing proof' }))
    expect(await screen.findByText('Missing proof')).toBeInTheDocument()
    expect(screen.getByLabelText('Organizer name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Decline…' })).not.toBeInTheDocument()
  })

  it('shows an error if the application cannot be loaded', async () => {
    adminService.getOrganizerApplication.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 404, data: { message: 'Application not found' } } }),
    )
    render(<OrganizerApplicationReviewModal applicationId="app-1" onClose={vi.fn()} onDone={vi.fn()} />)
    expect(await screen.findByText('Application not found')).toBeInTheDocument()
  })
})
