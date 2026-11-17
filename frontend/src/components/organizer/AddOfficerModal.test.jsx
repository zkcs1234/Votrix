import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AddOfficerModal from './AddOfficerModal'
import { organizerOfficersService } from '@/services/organizer-officers.service'

vi.mock('@/services/organizer-officers.service', () => ({
  organizerOfficersService: { candidates: vi.fn(), assign: vi.fn() },
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

const ada = { id: 's1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', schoolId: '2024-0001', program: 'BSCS' }
const grace = { id: 's2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', schoolId: '2024-0002', program: 'BSCS' }

const renderModal = (props = {}) => render(<AddOfficerModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} {...props} />)

// The button enables itself once the form is valid.
const submitOfficer = async () => {
  const button = screen.getByRole('button', { name: 'Add officer' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
}

beforeEach(() => {
  vi.resetAllMocks()
  organizerOfficersService.candidates.mockResolvedValue({ data: { candidates: [ada, grace] } })
  organizerOfficersService.assign.mockResolvedValue({ data: { officer: {} } })
})

describe('AddOfficerModal', () => {
  it('lists the eligible students returned by the server', async () => {
    renderModal()
    expect(await screen.findByRole('radio', { name: 'Ada Lovelace' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Grace Hopper' })).toBeInTheDocument()
    expect(screen.getByText(/2024-0001 · BSCS · ada@example.com/)).toBeInTheDocument()
    expect(organizerOfficersService.candidates).toHaveBeenCalledWith({ search: undefined, limit: 20 })
  })

  it('searches (debounced) as the organizer types', async () => {
    renderModal()
    await screen.findByRole('radio', { name: 'Ada Lovelace' })
    organizerOfficersService.candidates.mockResolvedValue({ data: { candidates: [grace] } })

    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: '  grace ' } })

    await waitFor(() => expect(organizerOfficersService.candidates).toHaveBeenLastCalledWith({ search: 'grace', limit: 20 }))
    await waitFor(() => expect(screen.queryByRole('radio', { name: 'Ada Lovelace' })).not.toBeInTheDocument())
    expect(screen.getByRole('radio', { name: 'Grace Hopper' })).toBeInTheDocument()
  })

  it('needs a student and a position before it can assign', async () => {
    renderModal()
    await screen.findByRole('radio', { name: 'Ada Lovelace' })

    const submit = screen.getByRole('button', { name: 'Add officer' })
    expect(submit).toBeDisabled()
    expect(screen.getByLabelText(/^Position/)).toBeDisabled() // no student chosen yet

    fireEvent.click(screen.getByRole('radio', { name: 'Ada Lovelace' }))
    expect(screen.getByLabelText(/^Position/)).toBeEnabled()
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^Position/), { target: { value: '  President ' } })
    await waitFor(() => expect(submit).toBeEnabled())
  })

  it('flags a blank or over-long position while typing', async () => {
    renderModal()
    fireEvent.click(await screen.findByRole('radio', { name: 'Ada Lovelace' }))
    const position = screen.getByLabelText(/^Position/)

    fireEvent.change(position, { target: { value: '   ' } })
    fireEvent.blur(position)
    expect(await screen.findByText('Position is required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add officer' })).toBeDisabled()

    // Long input is no longer silently truncated; it is flagged with a counter.
    fireEvent.change(position, { target: { value: 'p'.repeat(256) } })
    expect(await screen.findByText('Position must be 255 characters or fewer')).toBeInTheDocument()
    expect(screen.getByText('256/255')).toBeInTheDocument()
  })

  it('assigns the chosen student with the trimmed position, then reports success and closes', async () => {
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    renderModal({ onSuccess, onClose })
    fireEvent.click(await screen.findByRole('radio', { name: 'Grace Hopper' }))
    fireEvent.change(screen.getByLabelText(/^Position/), { target: { value: '  Secretary ' } })
    await submitOfficer()

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(organizerOfficersService.assign).toHaveBeenCalledWith({ studentId: 's2', position: 'Secretary' })
    expect(onClose).toHaveBeenCalled()
  })

  it('says so when the officer was added but the notification email did not go out', async () => {
    organizerOfficersService.assign.mockResolvedValue({ data: { officer: {}, email: { sent: false, skipped: true } } })
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(await screen.findByRole('radio', { name: 'Ada Lovelace' }))
    fireEvent.change(screen.getByLabelText(/^Position/), { target: { value: 'Aide' } })
    await submitOfficer()

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/notification email was not sent/))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('shows a plain success when the email was sent', async () => {
    organizerOfficersService.assign.mockResolvedValue({ data: { officer: {}, email: { sent: true } } })
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(await screen.findByRole('radio', { name: 'Ada Lovelace' }))
    fireEvent.change(screen.getByLabelText(/^Position/), { target: { value: 'Aide' } })
    await submitOfficer()

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Officer added')
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('shows the server’s reason and stays open when assignment is refused', async () => {
    organizerOfficersService.assign.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 403, data: { message: 'This student is outside your access scope' } } }),
    )
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(await screen.findByRole('radio', { name: 'Ada Lovelace' }))
    fireEvent.change(screen.getByLabelText(/^Position/), { target: { value: 'Aide' } })
    await submitOfficer()

    expect(await screen.findByText('This student is outside your access scope')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('explains an empty result and a failed load', async () => {
    organizerOfficersService.candidates.mockResolvedValue({ data: { candidates: [] } })
    renderModal()
    expect(await screen.findByText('No students are available to assign.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'zzz' } })
    expect(await screen.findByText('No matching students.')).toBeInTheDocument()

    organizerOfficersService.candidates.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 500, data: { message: 'Boom' } } }),
    )
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'yyy' } })
    expect(await screen.findByText('Boom')).toBeInTheDocument()
  })
})
