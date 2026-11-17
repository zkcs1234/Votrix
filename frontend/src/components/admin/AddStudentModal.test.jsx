import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AddStudentModal from './AddStudentModal'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: { getPrograms: vi.fn(), createVoter: vi.fn() },
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

function renderModal(props = {}) {
  return render(
    <MemoryRouter>
      <AddStudentModal onClose={vi.fn()} onSaved={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

async function fillAndSubmit() {
  await waitFor(() => expect(screen.getByRole('option', { name: 'BSCS' })).toBeInTheDocument())
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByLabelText(/^First Name/), { target: { value: 'Ada' } })
  fireEvent.change(screen.getByLabelText(/^Last Name/), { target: { value: 'Lovelace' } })
  fireEvent.change(screen.getByLabelText(/^School ID/), { target: { value: '2024-0001' } })
  fireEvent.change(screen.getByLabelText(/^Program/), { target: { value: 'BSCS' } })
  // The button enables itself once every field is valid.
  const submit = screen.getByRole('button', { name: 'Add Student' })
  await waitFor(() => expect(submit).toBeEnabled())
  fireEvent.click(submit)
}

beforeEach(() => {
  vi.resetAllMocks()
  adminService.getPrograms.mockResolvedValue({ data: { programs: ['BSCS'] } })
  adminService.createVoter.mockResolvedValue({ data: { user: { id: 's1' }, email: { sent: true } } })
})

describe('AddStudentModal (single STUDENT participant type)', () => {
  it('creates the student with ONE request and no separate "respondent" step', async () => {
    const onSaved = vi.fn()
    renderModal({ onSaved })
    await fillAndSubmit()

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(adminService.createVoter).toHaveBeenCalledTimes(1)
    expect(adminService.createVoter).toHaveBeenCalledWith({
      email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', schoolId: '2024-0001', program: 'BSCS',
    })
    // The old second step called an endpoint that does not exist; it is gone from the service entirely.
    expect(adminService.addRespondentMembership).toBeUndefined()
  })

  it('reports a plain success, with no misleading "Voter only" or "(Voter + Respondent)" wording', async () => {
    renderModal()
    await fillAndSubmit()

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Student added'))
    expect(toast.warning).not.toHaveBeenCalled()
    for (const call of [...toast.success.mock.calls, ...toast.warning.mock.calls]) {
      expect(String(call[0])).not.toMatch(/Voter|Respondent/i)
    }
  })

  it('warns when the sign-in email could not be sent', async () => {
    adminService.createVoter.mockResolvedValue({ data: { user: { id: 's1' }, email: { sent: false, skipped: true, reason: 'Email service not configured' } } })
    renderModal()
    await fillAndSubmit()

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Email skipped/)))
    expect(toast.success).toHaveBeenCalledWith('Student added')
  })

  it('explains an existing account instead of showing a bogus email warning', async () => {
    // The backend returns email: null when the address already belonged to a participant account.
    adminService.createVoter.mockResolvedValue({ data: { user: { id: 's1' }, email: null } })
    const onSaved = vi.fn()
    renderModal({ onSaved })
    await fillAndSubmit()

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/already had an account/))
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('shows the server’s validation errors and does not close', async () => {
    adminService.createVoter.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 409, data: { message: 'Conflict', details: { errors: ['Another participant already uses this school ID'] } } } }),
    )
    const onSaved = vi.fn()
    renderModal({ onSaved })
    await fillAndSubmit()

    expect(await screen.findAllByText('Another participant already uses this school ID')).not.toHaveLength(0)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('puts a duplicate-school-ID rejection on the School ID field, not only in a banner', async () => {
    adminService.createVoter.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 409, data: { message: 'Another participant already uses this school ID' } } }),
    )
    renderModal()
    await fillAndSubmit()

    const schoolId = screen.getByLabelText(/^School ID/)
    await waitFor(() => expect(schoolId).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getAllByText('Another participant already uses this school ID')).toHaveLength(1)
    // Editing the field to a valid value clears the server error.
    fireEvent.change(schoolId, { target: { value: '2024-0002' } })
    await waitFor(() => expect(schoolId).not.toHaveAttribute('aria-invalid'))
  })

  it('shows format errors while typing, before any submit', async () => {
    renderModal()
    await waitFor(() => expect(screen.getByRole('option', { name: 'BSCS' })).toBeInTheDocument())

    const email = screen.getByLabelText(/^Email/)
    fireEvent.change(email, { target: { value: 'ada@' } })
    fireEvent.blur(email)
    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument()

    const first = screen.getByLabelText(/^First Name/)
    fireEvent.change(first, { target: { value: '   ' } })
    fireEvent.blur(first)
    expect(await screen.findByText('First name is required')).toBeInTheDocument()

    // Nothing was submitted, and the button says why it is unavailable.
    expect(adminService.createVoter).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add Student' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Fix the highlighted fields')

    // Fixing the value clears the error immediately.
    fireEvent.change(email, { target: { value: 'ada@example.com' } })
    await waitFor(() => expect(screen.queryByText(/Enter a valid email address/)).not.toBeInTheDocument())
  })

  it('has no Year & Section field', async () => {
    renderModal()
    await waitFor(() => expect(screen.getByRole('option', { name: 'BSCS' })).toBeInTheDocument())
    expect(screen.queryByLabelText(/Year & Section/)).not.toBeInTheDocument()
  })

  it('cannot submit until programs are available', async () => {
    adminService.getPrograms.mockResolvedValue({ data: { programs: [] } })
    renderModal()
    expect(await screen.findByText(/No programs are available yet/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Student' })).toBeDisabled()
  })
})
