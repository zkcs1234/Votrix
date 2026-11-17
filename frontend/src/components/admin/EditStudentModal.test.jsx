import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import EditStudentModal from './EditStudentModal'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: { getPrograms: vi.fn(), updateVoter: vi.fn(), updateRespondent: vi.fn() },
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

const student = {
  id: 's1',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  schoolId: '2024-0001',
  program: 'BSCS',
  hasVoterType: true,
}

function renderModal(props = {}) {
  return render(<EditStudentModal student={student} onClose={vi.fn()} onSaved={vi.fn()} {...props} />)
}

beforeEach(() => {
  vi.resetAllMocks()
  adminService.getPrograms.mockResolvedValue({ data: { programs: ['BSCS', 'BSIT'] } })
  adminService.updateVoter.mockResolvedValue({ data: {} })
})

describe('EditStudentModal', () => {
  it('saves trimmed values', async () => {
    const onSaved = vi.fn()
    renderModal({ onSaved })
    await waitFor(() => expect(screen.getByRole('option', { name: 'BSIT' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/^First Name/), { target: { value: '  Augusta  ' } })
    const save = screen.getByRole('button', { name: 'Save Changes' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(adminService.updateVoter).toHaveBeenCalledWith('s1', {
      firstName: 'Augusta', lastName: 'Lovelace', schoolId: '2024-0001', program: 'BSCS',
    })
  })

  it('flags a cleared required field while typing and blocks saving', async () => {
    renderModal()
    await waitFor(() => expect(screen.getByRole('option', { name: 'BSIT' })).toBeInTheDocument())

    const schoolId = screen.getByLabelText(/^School ID/)
    fireEvent.change(schoolId, { target: { value: '' } })
    fireEvent.blur(schoolId)

    expect(await screen.findByText('School ID is required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
    expect(adminService.updateVoter).not.toHaveBeenCalled()
  })

  it('flags a saved program that has since been retired as soon as the list loads', async () => {
    renderModal({ student: { ...student, program: 'BSOLD' } })
    expect(await screen.findByText('Program is not in the program list')).toBeInTheDocument()
  })

  it('keeps the email locked', async () => {
    renderModal()
    expect(screen.getByLabelText(/^Email/)).toBeDisabled()
  })
})
