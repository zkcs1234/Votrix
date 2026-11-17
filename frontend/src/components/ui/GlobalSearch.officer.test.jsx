import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from './GlobalSearch'

let user
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user, role: user.role }) }))
vi.mock('@/services/admin.service', () => ({ adminService: { platformSearch: vi.fn(async () => ({ data: {} })) } }))

const officership = { organizerId: 'org-1', organizationName: 'Computing Society', position: 'President' }

function search(path, term) {
  render(<MemoryRouter initialEntries={[path]}><GlobalSearch /></MemoryRouter>)
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: term } })
}

beforeEach(() => {
  document.body.style.overflow = ''
})

describe('GlobalSearch and student officers', () => {
  it('the real organizer can find the Account Manager', () => {
    user = { id: 'o1', role: 'organizer' }
    search('/organizer', 'officers')
    expect(screen.getByText('Account Manager')).toBeInTheDocument()
  })

  it('an officer searching inside /organizer gets organizer pages but not the owner-only one', () => {
    user = { id: 's1', role: 'participant', officership }
    search('/organizer', 'election')
    expect(screen.getByText('Election Module')).toBeInTheDocument()

    document.body.innerHTML = ''
    search('/organizer', 'officers')
    expect(screen.queryByText('Account Manager')).not.toBeInTheDocument()
  })

  it('a plain student gets no organizer pages', () => {
    user = { id: 's2', role: 'participant', officership: null }
    search('/participant', 'election')
    expect(screen.queryByText('Election Module')).not.toBeInTheDocument()
  })
})
