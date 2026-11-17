import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import OrganizerOfficersCard from './OrganizerOfficersCard'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: { getOrganizerOfficers: vi.fn(), deactivateOrganizerOfficer: vi.fn() },
}))

const active = {
  id: 'off-1', status: 'active', position: 'President', assignedAt: '2026-03-04T00:00:00.000Z',
  student: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
}
const inactive = { ...active, id: 'off-2', status: 'inactive', position: 'Secretary', student: { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' } }

beforeEach(() => {
  vi.resetAllMocks()
  adminService.getOrganizerOfficers.mockResolvedValue({ data: { officers: [active, inactive] } })
  adminService.deactivateOrganizerOfficer.mockResolvedValue({ data: {} })
})

describe('OrganizerOfficersCard (admin)', () => {
  it('lists the organizer’s officers with a count', async () => {
    render(<OrganizerOfficersCard organizerId="org-1" />)
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(adminService.getOrganizerOfficers).toHaveBeenCalledWith('org-1')
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getByText('1 active of 2')).toBeInTheDocument()
  })

  it('offers deactivation only for active officers', async () => {
    render(<OrganizerOfficersCard organizerId="org-1" />)
    await screen.findByText('Ada Lovelace')
    expect(within(screen.getByText('Ada Lovelace').closest('tr')).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
    expect(within(screen.getByText('Grace Hopper').closest('tr')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('confirms, then deactivates through the admin endpoint', async () => {
    render(<OrganizerOfficersCard organizerId="org-1" />)
    await screen.findByText('Ada Lovelace')
    fireEvent.click(within(screen.getByText('Ada Lovelace').closest('tr')).getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByText(/administrator action/)).toBeInTheDocument()
    expect(adminService.deactivateOrganizerOfficer).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(adminService.deactivateOrganizerOfficer).toHaveBeenCalledWith('org-1', 'off-1'))
  })

  it('shows an empty message and an error state', async () => {
    adminService.getOrganizerOfficers.mockResolvedValue({ data: { officers: [] } })
    const { unmount } = render(<OrganizerOfficersCard organizerId="org-1" />)
    expect(await screen.findByText(/has not assigned any student officers/)).toBeInTheDocument()
    unmount()

    adminService.getOrganizerOfficers.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 500, data: { message: 'Server error' } } }),
    )
    render(<OrganizerOfficersCard organizerId="org-1" />)
    expect(await screen.findByText('Server error')).toBeInTheDocument()
  })
})
