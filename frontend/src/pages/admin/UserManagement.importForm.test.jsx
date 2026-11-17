import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OrganizerManagementPage from './OrganizerManagementPage'
import StudentsPanel from '@/components/admin/StudentsPanel'
import JudgesPanel from '@/components/admin/JudgesPanel'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: {
    getOrganizers: vi.fn(),
    getVoters: vi.fn(),
    getRespondents: vi.fn(),
    getVoterCsvTemplate: vi.fn(),
    getJudges: vi.fn(),
    getJudgeCsvTemplate: vi.fn(),
    getParticipantTaxonomy: vi.fn(),
  },
}))
vi.mock('@/utils/csvDownload', () => ({ downloadBlob: vi.fn(), downloadCsv: vi.fn() }))
// The edit form is exercised elsewhere; here it only needs to show that it opened.
vi.mock('@/components/admin/CreateOrganizerModal', () => ({
  default: ({ isOpen, organizer }) => (isOpen ? <p>Organizer form open: {organizer ? organizer.email : 'NEW'}</p> : null),
}))

const organizer = {
  id: 'o1', email: 'org@example.com', organization_name: 'Computing Society', organizer_name: 'Ada',
  position: 'Adviser', account_status: 'active', created_at: '2026-01-01T00:00:00.000Z',
}

const renderIt = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  vi.resetAllMocks()
  adminService.getOrganizers.mockResolvedValue({ data: { organizers: [organizer] } })
  adminService.getVoters.mockResolvedValue({ data: { voters: [], participants: [], total: 0 } })
  adminService.getRespondents.mockResolvedValue({ data: { respondents: [], participants: [], total: 0 } })
  adminService.getJudges.mockResolvedValue({ data: { judges: [], total: 0, page: 1, limit: 50 } })
  adminService.getParticipantTaxonomy.mockResolvedValue({ data: { taxonomy: { programs: [], sections: [] } } })
  for (const name of ['getVoterCsvTemplate', 'getJudgeCsvTemplate']) {
    adminService[name].mockResolvedValue({ data: new Blob(['x']) })
  }
})

describe('Organizers › Accounts', () => {
  it('no longer offers "Add organizer" (organizers join by invitation)', async () => {
    renderIt(<OrganizerManagementPage />)
    await screen.findByText('Computing Society')
    expect(screen.queryByRole('button', { name: /Add organizer/i })).not.toBeInTheDocument()
  })

  it('offers Export CSV but no CSV import or import form (organizers join by invitation)', async () => {
    renderIt(<OrganizerManagementPage />)
    await screen.findByText('Computing Society')

    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Form' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Review CSV import|Import CSV/ })).not.toBeInTheDocument()
  })

  it('Edit still opens the organizer form for that organizer', async () => {
    renderIt(<OrganizerManagementPage />)
    await screen.findByText('Computing Society')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByText('Organizer form open: org@example.com')).toBeInTheDocument()
  })

  it('shows the explanatory empty state without an add button', async () => {
    adminService.getOrganizers.mockResolvedValue({ data: { organizers: [] } })
    renderIt(<OrganizerManagementPage />)
    // The default "Active" filter is on, so an empty list reads as a filtered result.
    expect(await screen.findByText('No organizers match the current filters.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add organizer/i })).not.toBeInTheDocument()
  })
})

describe('"Form" replaces "Template" on the other user-management lists', () => {
  it('Participants › Students', async () => {
    renderIt(<StudentsPanel />)
    const form = await screen.findByRole('button', { name: 'Form' })
    expect(screen.queryByRole('button', { name: 'Template' })).not.toBeInTheDocument()

    fireEvent.click(form)
    await waitFor(() => expect(adminService.getVoterCsvTemplate).toHaveBeenCalled())
  })

  it('Participants › Judges', async () => {
    renderIt(<JudgesPanel />)
    const form = await screen.findByRole('button', { name: 'Form' })
    expect(screen.queryByRole('button', { name: 'Template' })).not.toBeInTheDocument()

    fireEvent.click(form)
    await waitFor(() => expect(adminService.getJudgeCsvTemplate).toHaveBeenCalled())
  })
})
