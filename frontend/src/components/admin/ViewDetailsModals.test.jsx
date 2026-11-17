import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ViewStudentDetailsModal from './ViewStudentDetailsModal'
import ViewJudgeDetailsModal from './ViewJudgeDetailsModal'
import ViewOrganizerDetailsModal from './ViewOrganizerDetailsModal'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({ adminService: { getOrganizers: vi.fn() } }))

const student = {
  id: 's1', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', schoolId: '2024-0001',
  program: 'BSCS', accountStatus: 'active', createdAt: '2026-03-04T08:30:00.000Z',
  // Left over from the old two-type model; must not be shown any more.
  hasVoterType: true, hasRespondentType: true,
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ViewStudentDetailsModal', () => {
  it('shows the student, their academic details and the account info', () => {
    render(<ViewStudentDetailsModal student={student} onClose={vi.fn()} />)
    expect(screen.getByText('Student Details')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    for (const value of ['2024-0001', 'BSCS', 's1']) expect(screen.getByText(value)).toBeInTheDocument()
  })

  it('no longer shows participant types (the Students page already says students join elections and polls)', () => {
    render(<ViewStudentDetailsModal student={student} onClose={vi.fn()} />)
    expect(screen.queryByText('Participant Types')).not.toBeInTheDocument()
    expect(screen.queryByText(/Election Voter/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Polling Respondent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/No participant types/i)).not.toBeInTheDocument()
  })
})

describe('ViewJudgeDetailsModal', () => {
  const judge = (profileData) => ({
    id: 'j1', email: 'judge@example.com', firstName: 'Grace', lastName: 'Hopper', accountStatus: 'active',
    createdAt: '2026-03-04T08:30:00.000Z', profileData,
  })

  it('shows the judge profile and account info', () => {
    render(<ViewJudgeDetailsModal judge={judge({ title: 'Dr.', affiliation: 'Navy', expertise: 'Compilers' })} onClose={vi.fn()} />)
    expect(screen.getByText('Judge Details')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    for (const value of ['Dr.', 'Navy', 'Compilers', 'j1']) expect(screen.getByText(value)).toBeInTheDocument()
  })

  it('has no organizer assignment (judges are a global pool) and never loads organizers', () => {
    render(<ViewJudgeDetailsModal judge={judge({ expertise: 'x', organizerIds: ['o1'] })} onClose={vi.fn()} />)
    expect(screen.queryByText('Assigned organizers')).not.toBeInTheDocument()
    expect(adminService.getOrganizers).not.toHaveBeenCalled()
  })
})

describe('ViewOrganizerDetailsModal', () => {
  const organizer = {
    id: 'o1', email: 'org@example.com', organizer_name: 'Ada Lovelace', position: 'Adviser',
    organization_name: 'Computing Society', organization_type_display: 'Co-curricular',
    scope: { scopeType: 'scoped', programs: ['BSCS'] },
    account_status: 'archived', created_at: '2026-03-04T08:30:00.000Z',
  }
  const renderModal = (o = organizer) => render(<MemoryRouter><ViewOrganizerDetailsModal organizer={o} onClose={vi.fn()} /></MemoryRouter>)

  it('shows the organization, position, student access and account info', () => {
    renderModal()
    expect(screen.getByText('Organizer Details')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('archived')).toBeInTheDocument()
    for (const value of ['Computing Society', 'Co-curricular', 'Adviser', 'BSCS', 'o1']) {
      expect(screen.getByText(value)).toBeInTheDocument()
    }
  })

  it('describes unrestricted access and tolerates missing fields', () => {
    renderModal({ id: 'o2', email: 'x@y.z', scope: { scopeType: 'all', programs: [] }, created_at: null })
    expect(screen.getByText('All access')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('links to the activity and student-officers page', () => {
    renderModal()
    expect(screen.getByRole('link', { name: /Activity & student officers/ })).toHaveAttribute('href', '/admin/organizers/o1')
  })
})
