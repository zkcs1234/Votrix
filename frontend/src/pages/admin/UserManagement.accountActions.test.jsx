import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrganizerManagementPage from './OrganizerManagementPage'
import StudentsPanel from '@/components/admin/StudentsPanel'
import JudgesPanel from '@/components/admin/JudgesPanel'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: {
    getOrganizers: vi.fn(), updateOrganizerStatus: vi.fn(),
    getVoters: vi.fn(), getRespondents: vi.fn(), updateVoterStatus: vi.fn(), updateRespondentStatus: vi.fn(),
    registerVotersCsv: vi.fn(), previewVotersCsv: vi.fn(),
    getJudges: vi.fn(), updateJudgeStatus: vi.fn(),
    getParticipantTaxonomy: vi.fn(),
  },
}))
vi.mock('@/components/admin/CreateOrganizerModal', () => ({ default: () => null }))

const organizers = [
  { id: 'o1', email: 'active@org.test', organizer_name: 'Ada', organization_name: 'Computing Society', position: 'Adviser', organization_type_display: 'Co-curricular', account_status: 'active', created_at: '2026-01-02T00:00:00.000Z', scope: { scopeType: 'all' } },
  { id: 'o2', email: 'archived@org.test', organizer_name: 'Grace', organization_name: 'Drama Club', account_status: 'archived', created_at: '2026-01-01T00:00:00.000Z' },
  { id: 'o3', email: 'legacy@org.test', organizer_name: 'Linus', organization_name: 'Legacy Org', account_status: 'suspended', created_at: '2025-12-01T00:00:00.000Z' },
]
const student = (id, status, extra = {}) => ({
  id, email: `${id}@school.test`, firstName: id.toUpperCase(), lastName: 'Student', schoolId: `2024-${id}`, program: 'BSCS',
  accountStatus: status, createdAt: `2026-01-0${id.length}T00:00:00.000Z`, ...extra,
})
const students = [student('a', 'active'), student('bb', 'archived')]
const judges = [
  { id: 'j1', email: 'judge1@x.test', firstName: 'Judy', lastName: 'One', accountStatus: 'active', profileData: { expertise: 'Dance' }, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'j2', email: 'judge2@x.test', firstName: 'Jim', lastName: 'Two', accountStatus: 'archived', profileData: {}, createdAt: '2026-01-01T00:00:00.000Z' },
]

const renderIt = (ui) =>
  render(
    <MemoryRouter initialEntries={['/list']}>
      <Routes>
        <Route path="/list" element={ui} />
        <Route path="/admin/organizers/:id" element={<p>Organizer activity page</p>} />
      </Routes>
    </MemoryRouter>,
  )

const rowOf = (text) => screen.getByText(text).closest('tr')
const buttonNames = (row) => within(row).getAllByRole('button').map((b) => b.textContent.trim())

beforeEach(() => {
  vi.resetAllMocks()
  adminService.getOrganizers.mockResolvedValue({ data: { organizers } })
  adminService.getVoters.mockResolvedValue({ data: { voters: students } })
  adminService.getRespondents.mockResolvedValue({ data: { respondents: students } })
  adminService.getJudges.mockResolvedValue({ data: { judges, total: judges.length } })
  adminService.getParticipantTaxonomy.mockResolvedValue({ data: { taxonomy: { programs: [], sections: [] } } })
  for (const name of ['updateOrganizerStatus', 'updateVoterStatus', 'updateJudgeStatus']) adminService[name].mockResolvedValue({ data: {} })
})

describe('Students panel', () => {
  it('loads ONE list (no separate respondents fetch) and shows the same row actions as the other lists', async () => {
    renderIt(<StudentsPanel />)
    await screen.findByText('A Student')

    expect(adminService.getVoters).toHaveBeenCalledTimes(1)
    expect(adminService.getRespondents).not.toHaveBeenCalled()
    expect(buttonNames(rowOf('A Student'))).toEqual(['Edit', 'Archive', 'View'])
    expect(buttonNames(rowOf('BB Student'))).toEqual(['Edit', 'Restore', 'View'])
  })

  it('has no Suspend anywhere: not as a button, a filter, or a stat', async () => {
    renderIt(<StudentsPanel />)
    await screen.findByText('A Student')

    expect(screen.queryByRole('button', { name: /Suspend|Reinstate/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Suspended/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Suspended')).not.toBeInTheDocument()
    // The Suspended stat card became Archived (the filter also has an "Archived" option).
    expect(screen.getByText('Archived', { selector: 'p' })).toBeInTheDocument()
  })

  it('View shows the student without participant types', async () => {
    renderIt(<StudentsPanel />)
    await screen.findByText('A Student')
    fireEvent.click(within(rowOf('A Student')).getByRole('button', { name: 'View' }))

    expect(await screen.findByText('Student Details')).toBeInTheDocument()
    expect(screen.queryByText('Participant Types')).not.toBeInTheDocument()
    expect(screen.queryByText(/Election Voter|Polling Respondent/i)).not.toBeInTheDocument()
  })

  it('archiving makes a single status call (not one per voter/respondent type)', async () => {
    renderIt(<StudentsPanel />)
    await screen.findByText('A Student')
    fireEvent.click(within(rowOf('A Student')).getByRole('button', { name: 'Archive' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(adminService.updateVoterStatus).toHaveBeenCalledWith('a', 'archived'))
    expect(adminService.updateVoterStatus).toHaveBeenCalledTimes(1)
    expect(adminService.updateRespondentStatus).not.toHaveBeenCalled()
  })
})

describe('Judges panel', () => {
  it('has View like the students, and no Suspend', async () => {
    renderIt(<JudgesPanel />)
    await screen.findByText('Judy One')

    expect(buttonNames(rowOf('Judy One'))).toEqual(['Edit', 'Archive', 'View'])
    expect(buttonNames(rowOf('Jim Two'))).toEqual(['Edit', 'Restore', 'View'])
    expect(screen.queryByRole('button', { name: /Suspend|Reinstate/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Suspended/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Suspended')).not.toBeInTheDocument()
    expect(screen.getByText('Archived', { selector: 'p' })).toBeInTheDocument()
  })

  it('View opens the judge details', async () => {
    renderIt(<JudgesPanel />)
    await screen.findByText('Judy One')
    fireEvent.click(within(rowOf('Judy One')).getByRole('button', { name: 'View' }))

    expect(await screen.findByText('Judge Details')).toBeInTheDocument()
    expect(screen.getAllByText('Dance').length).toBeGreaterThan(0)
  })

  it('archives through the confirmation', async () => {
    renderIt(<JudgesPanel />)
    await screen.findByText('Judy One')
    fireEvent.click(within(rowOf('Judy One')).getByRole('button', { name: 'Archive' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(adminService.updateJudgeStatus).toHaveBeenCalledWith('j1', 'archived'))
  })
})

describe('Organizers › Accounts', () => {
  const showAll = () => fireEvent.click(screen.getByRole('button', { name: 'All' }))

  it('has View like the students, and no Suspend', async () => {
    renderIt(<OrganizerManagementPage />)
    await screen.findByText('Computing Society')
    showAll()
    await screen.findByText('Drama Club')

    expect(buttonNames(rowOf('Computing Society'))).toEqual(['Edit', 'Archive', 'View'])
    expect(buttonNames(rowOf('Drama Club'))).toEqual(['Edit', 'Restore', 'View'])
    expect(screen.queryByRole('button', { name: /Suspend|Reinstate/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suspended' })).not.toBeInTheDocument()
    expect(screen.getByText('Archived', { selector: 'p' })).toBeInTheDocument()
  })

  it('a legacy suspended organizer is still reachable under "All" and can be restored', async () => {
    renderIt(<OrganizerManagementPage />)
    await screen.findByText('Computing Society')
    showAll()
    await screen.findByText('Legacy Org')

    expect(buttonNames(rowOf('Legacy Org'))).toEqual(['Edit', 'Restore', 'Archive', 'View'])
  })

  it('View opens the details without navigating away from the list', async () => {
    renderIt(<OrganizerManagementPage />)
    await screen.findByText('Computing Society')
    fireEvent.click(within(rowOf('Computing Society')).getByRole('button', { name: 'View' }))

    expect(await screen.findByText('Organizer Details')).toBeInTheDocument()
    expect(screen.queryByText('Organizer activity page')).not.toBeInTheDocument()
  })

  it('clicking the row itself still opens the activity page (unchanged)', async () => {
    renderIt(<OrganizerManagementPage />)
    await screen.findByText('Computing Society')
    fireEvent.click(rowOf('Computing Society'))
    expect(await screen.findByText('Organizer activity page')).toBeInTheDocument()
  })

  it('archives through the confirmation', async () => {
    renderIt(<OrganizerManagementPage />)
    await screen.findByText('Computing Society')
    fireEvent.click(within(rowOf('Computing Society')).getByRole('button', { name: 'Archive' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(adminService.updateOrganizerStatus).toHaveBeenCalledWith('o1', 'archived'))
  })
})
