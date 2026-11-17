import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OfficerWorkspaceCard from './OfficerWorkspaceCard'

let user
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user }) }))

const officership = { organizerId: 'org-1', organizationName: 'Computing Society', position: 'President' }
const renderCard = () => render(<MemoryRouter><OfficerWorkspaceCard /></MemoryRouter>)

describe('OfficerWorkspaceCard', () => {
  it('invites an officer into the workspace', () => {
    user = { role: 'participant', officership }
    renderCard()
    expect(screen.getByText('President · Computing Society')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open organizer workspace/ })).toHaveAttribute('href', '/organizer')
  })

  it.each([
    ['a plain student', { role: 'participant', officership: null }],
    ['an organizer', { role: 'organizer' }],
    ['an admin', { role: 'admin', officership }],
    ['nobody', null],
  ])('renders nothing for %s', (_label, u) => {
    user = u
    const { container } = renderCard()
    expect(container).toBeEmptyDOMElement()
  })
})
