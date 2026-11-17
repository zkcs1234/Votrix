import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import OrganizersPage from './OrganizersPage'
import { adminService } from '@/services/admin.service'

vi.mock('./OrganizerManagementPage', () => ({ default: () => <p>Organizer accounts list</p> }))
vi.mock('@/components/admin/OrganizerInvitationsPanel', () => ({ default: () => <p>Invitations panel</p> }))
vi.mock('@/components/admin/OrganizerApplicationsPanel', () => ({ default: () => <p>Applications panel</p> }))
vi.mock('@/services/admin.service', () => ({ adminService: { listOrganizerApplications: vi.fn() } }))

function Location() {
  return <output data-testid="search">{useLocation().search}</output>
}

const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/admin/organizers" element={<><OrganizersPage /><Location /></>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.resetAllMocks()
  adminService.listOrganizerApplications.mockResolvedValue({ data: { applications: [], total: 3 } })
})

describe('OrganizersPage', () => {
  it('opens on the accounts list by default and keeps the URL clean', () => {
    renderAt('/admin/organizers')
    expect(screen.getByText('Organizer accounts list')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('')
  })

  it('is organizers only: there is no Participants tab on this page', () => {
    renderAt('/admin/organizers')
    expect(screen.queryByRole('tab', { name: 'Participants' })).not.toBeInTheDocument()
    expect(screen.queryByText('Students panel')).not.toBeInTheDocument()
  })

  it('switches to Invitations and Applications and records the section in the URL', () => {
    renderAt('/admin/organizers')

    fireEvent.click(screen.getByRole('tab', { name: /Invitations/ }))
    expect(screen.getByText('Invitations panel')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?section=invitations')

    fireEvent.click(screen.getByRole('tab', { name: /Applications/ }))
    expect(screen.getByText('Applications panel')).toBeInTheDocument()
    expect(screen.queryByText('Invitations panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Accounts' }))
    expect(screen.getByText('Organizer accounts list')).toBeInTheDocument()
    expect(screen.getByTestId('search')).not.toHaveTextContent('section')
  })

  it('deep-links straight to a section', () => {
    renderAt('/admin/organizers?section=applications')
    expect(screen.getByText('Applications panel')).toBeInTheDocument()
  })

  it('ignores an unknown section value', () => {
    renderAt('/admin/organizers?section=bogus')
    expect(screen.getByText('Organizer accounts list')).toBeInTheDocument()
  })

  it('shows the number of applications waiting for review', async () => {
    renderAt('/admin/organizers')
    await waitFor(() => expect(screen.getByRole('tab', { name: /Applications/ })).toHaveTextContent('3'))
    expect(adminService.listOrganizerApplications).toHaveBeenCalledWith({ status: 'pending', limit: 1 })
  })

  it('shows no count when there is nothing pending or the count fails to load', async () => {
    adminService.listOrganizerApplications.mockResolvedValue({ data: { applications: [], total: 0 } })
    renderAt('/admin/organizers')
    await waitFor(() => expect(adminService.listOrganizerApplications).toHaveBeenCalled())
    expect(screen.getByRole('tab', { name: /Applications/ })).not.toHaveTextContent(/\d/)
  })
})
