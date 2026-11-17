import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrganizerOfficersPage from './OrganizerOfficersPage'
import { organizerOfficersService } from '@/services/organizer-officers.service'

let role
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ role }) }))
vi.mock('@/services/organizer-officers.service', () => ({
  organizerOfficersService: {
    list: vi.fn(), candidates: vi.fn(), assign: vi.fn(), updatePosition: vi.fn(), deactivate: vi.fn(), activate: vi.fn(),
  },
}))

const officer = (over = {}) => ({
  id: 'off-1',
  studentId: 's1',
  position: 'President',
  status: 'active',
  assignedAt: '2026-03-04T00:00:00.000Z',
  student: { id: 's1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', program: 'BSCS' },
  ...over,
})
const inactive = officer({ id: 'off-2', status: 'inactive', position: 'Secretary', student: { id: 's2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' } })

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/organizer/officers']}>
      <Routes>
        <Route path="/organizer" element={<p>Organizer home</p>} />
        <Route path="/organizer/officers" element={<OrganizerOfficersPage />} />
      </Routes>
    </MemoryRouter>,
  )

const rowFor = (text) => screen.getByText(text).closest('tr')

beforeEach(() => {
  vi.resetAllMocks()
  role = 'organizer'
  organizerOfficersService.list.mockImplementation(async ({ status }) => ({
    data: { officers: status === 'inactive' ? [inactive] : status === 'all' ? [officer(), inactive] : [officer()] },
  }))
  organizerOfficersService.candidates.mockResolvedValue({ data: { candidates: [] } })
  organizerOfficersService.updatePosition.mockResolvedValue({ data: {} })
  organizerOfficersService.deactivate.mockResolvedValue({ data: {} })
  organizerOfficersService.activate.mockResolvedValue({ data: {} })
})

describe('OrganizerOfficersPage', () => {
  it('lists active officers by default with their student details', async () => {
    renderPage()
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(organizerOfficersService.list).toHaveBeenCalledWith({ status: 'active' })
    const row = rowFor('Ada Lovelace')
    expect(within(row).getByText('President')).toBeInTheDocument()
    expect(within(row).getByText('BSCS')).toBeInTheDocument()
    expect(within(row).getByText('Active')).toBeInTheDocument()
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument()
  })

  it('switches between Active, Inactive and All', async () => {
    renderPage()
    await screen.findByText('Ada Lovelace')

    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }))
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument()
    expect(organizerOfficersService.list).toHaveBeenLastCalledWith({ status: 'inactive' })

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
  })

  it('shows a helpful empty state', async () => {
    organizerOfficersService.list.mockResolvedValue({ data: { officers: [] } })
    renderPage()
    expect(await screen.findByText(/No active officers yet/)).toBeInTheDocument()
  })

  it('shows a load error', async () => {
    organizerOfficersService.list.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 500, data: { message: 'Server error' } } }),
    )
    renderPage()
    expect(await screen.findByText('Server error')).toBeInTheDocument()
  })

  it('edits a position', async () => {
    renderPage()
    await screen.findByText('Ada Lovelace')
    fireEvent.click(within(rowFor('Ada Lovelace')).getByRole('button', { name: 'Edit position' }))

    const input = screen.getByLabelText('Position')
    expect(input).toHaveValue('President')
    fireEvent.change(input, { target: { value: '  Chairperson ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(organizerOfficersService.updatePosition).toHaveBeenCalledWith('off-1', 'Chairperson'))
    await waitFor(() => expect(screen.queryByLabelText('Position')).not.toBeInTheDocument())
  })

  it('asks for confirmation before deactivating, then deactivates and reloads', async () => {
    renderPage()
    await screen.findByText('Ada Lovelace')
    fireEvent.click(within(rowFor('Ada Lovelace')).getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByText(/lose access/)).toBeInTheDocument()
    expect(organizerOfficersService.deactivate).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(organizerOfficersService.deactivate).toHaveBeenCalledWith('off-1'))
    await waitFor(() => expect(organizerOfficersService.list.mock.calls.length).toBeGreaterThan(1))
  })

  it('can cancel the deactivation', async () => {
    renderPage()
    await screen.findByText('Ada Lovelace')
    fireEvent.click(within(rowFor('Ada Lovelace')).getByRole('button', { name: 'Deactivate' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(organizerOfficersService.deactivate).not.toHaveBeenCalled()
  })

  it('activates an inactive officer', async () => {
    renderPage()
    await screen.findByText('Ada Lovelace')
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }))
    await screen.findByText('Grace Hopper')

    fireEvent.click(within(rowFor('Grace Hopper')).getByRole('button', { name: 'Activate' }))
    await waitFor(() => expect(organizerOfficersService.activate).toHaveBeenCalledWith('off-2'))
  })

  it('opens the add-officer dialog', async () => {
    renderPage()
    await screen.findByText('Ada Lovelace')
    fireEvent.click(screen.getByRole('button', { name: /Add officer/ }))
    expect(await screen.findByLabelText('Find a student')).toBeInTheDocument()
  })

  it('is owner-only: an officer is sent back to the organizer home and nothing is loaded', async () => {
    role = 'participant'
    renderPage()
    expect(await screen.findByText('Organizer home')).toBeInTheDocument()
    expect(organizerOfficersService.list).not.toHaveBeenCalled()
  })
})
