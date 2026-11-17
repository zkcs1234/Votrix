import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProfileCard from './ProfileCard'
import { organizerProfileService } from '@/services/organizer-profile.service'

vi.mock('@/services/organizer-profile.service', () => ({ organizerProfileService: { getProfile: vi.fn() } }))
vi.mock('@/services/auth.service', () => ({ authService: { logout: vi.fn() } }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'org@example.com', scope: { scopeType: 'all' } }, clearSession: vi.fn() }),
}))

const renderCard = () => render(<MemoryRouter><ProfileCard onClose={vi.fn()} /></MemoryRouter>)

beforeEach(() => vi.resetAllMocks())

describe('Organizer profile (read-only)', () => {
  it('shows the profile and the account type, with no way to edit it', async () => {
    organizerProfileService.getProfile.mockResolvedValue({
      data: { profile: { organizationName: 'SSG', organizationType: 'Co-curricular', organizerName: 'Jo Reyes', position: 'Adviser' } },
    })
    renderCard()

    expect(await screen.findByText('SSG')).toBeInTheDocument()
    expect(screen.getByText('Organizer')).toBeInTheDocument()
    expect(screen.getByText('Jo Reyes')).toBeInTheDocument()
    expect(screen.getByText('Adviser')).toBeInTheDocument()
    expect(screen.getByText(/managed by an administrator/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit profile|set up profile|save/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('tells an organizer with an empty profile to ask an administrator, instead of offering a form', async () => {
    organizerProfileService.getProfile.mockResolvedValue({ data: { profile: null } })
    renderCard()

    expect(await screen.findByText(/Ask an administrator to complete them/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set up profile/i })).not.toBeInTheDocument()
  })
})
