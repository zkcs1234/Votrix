import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'

// Real DashboardLayout + AppShell; only the network/realtime edges are stubbed
// (same approach as DashboardLayout.officer.test.jsx).
let user
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user, role: user.role, clearSession: vi.fn() }),
}))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))
vi.mock('@/hooks/useParticipantSync', () => ({ useParticipantSync: vi.fn() }))
vi.mock('@/services/notifications.service', () => ({
  notificationsService: { getUnreadCount: async () => ({ data: { unreadCount: 0 } }) },
}))
vi.mock('@/services/auth.service', () => ({ authService: { getMe: vi.fn(), logout: vi.fn() } }))
vi.mock('@/components/ui/GlobalSearch', () => ({ default: () => null }))
vi.mock('@/components/brand/VotrixLogo', () => ({ default: () => <span>Votrix</span> }))
vi.mock('@/components/ui/NotificationsModal', () => ({ default: () => null }))

import { useParticipantSync } from '@/hooks/useParticipantSync'

const officership = { organizerId: 'org-1', organizationName: 'Computing Society', position: 'President' }

function renderAt(path, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/participant/*" element={<DashboardLayout title="Participant" {...props} />}>
          <Route path="*" element={<p>Participant page</p>} />
        </Route>
        <Route path="/organizer/*" element={<DashboardLayout title="Organizer" />}>
          <Route path="*" element={<p>Organizer page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const link = (name) => screen.queryByRole('link', { name })

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
  user = { id: 's1', role: 'participant', email: 's1@example.com', participantTypes: ['STUDENT'], officership: null }
})

describe('participant sidebar', () => {
  it('gives a student the four pages and nothing for admins, organizers or officers', () => {
    renderAt('/participant')
    expect(link('Participant Dashboard')).toHaveAttribute('href', '/participant')
    expect(link('My events')).toHaveAttribute('href', '/participant/my-events')
    expect(link('History')).toHaveAttribute('href', '/participant/history')
    expect(link('Results')).toHaveAttribute('href', '/participant/results')
    for (const hidden of ['Open workspace', 'Student view', 'Reports', 'Account Manager', 'Organizers', 'Participants']) {
      expect(link(hidden)).toBeNull()
    }
  })

  it('gives a judge the same four pages (only the content differs)', () => {
    user = { ...user, participantTypes: ['JUDGE'] }
    renderAt('/participant')
    expect(['Participant Dashboard', 'My events', 'History', 'Results'].map((name) => link(name) !== null)).toEqual([true, true, true, true])
  })

  it.each([
    ['/participant', 'Participant Dashboard'],
    ['/participant/my-events', 'My events'],
    ['/participant/history', 'History'],
    ['/participant/results', 'Results'],
    // The event pages you open from My events belong to My events.
    ['/participant/events/e1', 'My events'],
    ['/participant/polling/events/p1', 'My events'],
    ['/participant/competition/events/c1/score', 'My events'],
  ])('%s highlights only %s', (path, active) => {
    renderAt(path)
    const current = ['Participant Dashboard', 'My events', 'History', 'Results'].filter((name) => link(name)?.getAttribute('aria-current') === 'page')
    expect(current).toEqual([active])
  })

  it('labels the account chip by type', () => {
    renderAt('/participant')
    expect(screen.getByText('Student')).toBeInTheDocument()
  })

  it('labels a judge', () => {
    user = { ...user, participantTypes: ['JUDGE'] }
    renderAt('/participant')
    expect(screen.getByText('Judge')).toBeInTheDocument()
  })

  it('keeps the participant context in sync only for participants', () => {
    renderAt('/participant')
    expect(useParticipantSync).toHaveBeenLastCalledWith(true)
  })
})

describe('student officer', () => {
  beforeEach(() => {
    user = { ...user, officership }
  })

  it('sees the same four pages plus a way into the organizer workspace', () => {
    renderAt('/participant')
    expect(link('Open workspace')).toHaveAttribute('href', '/organizer')
    expect(link('My events')).not.toBeNull()
    expect(screen.getByText('Student · Officer')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('inside the organizer workspace gets the organizer view, not the student pages', () => {
    renderAt('/organizer')
    expect(link('Reports')).not.toBeNull()
    expect(link('My events')).toBeNull()
    expect(link('History')).toBeNull()
    expect(screen.getByText('Officer')).toBeInTheDocument()
    expect(useParticipantSync).toHaveBeenLastCalledWith(false)
  })
})

describe('task pages open with a collapsed rail that can be expanded', () => {
  it('shows the expand/collapse toggle on list pages', () => {
    renderAt('/participant/history')
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
  })

  it('railOnly opens collapsed but keeps the toggle, and the pages are still one click away', () => {
    renderAt('/participant/events/e1', { railOnly: true })
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    expect(link('History')).toHaveAttribute('href', '/participant/history')
  })

  it('railOnly ignores a saved "expanded" preference when it opens', () => {
    localStorage.setItem('votrix.sidebar.collapsed', 'false')
    const { container } = renderAt('/participant/events/e1', { railOnly: true })
    expect(container.querySelector('aside')).toHaveClass('w-18')
  })

  it('railOnly can be expanded and collapsed again without changing the saved preference', () => {
    localStorage.setItem('votrix.sidebar.collapsed', 'true')
    const { container } = renderAt('/participant/events/e1', { railOnly: true })
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(container.querySelector('aside')).toHaveClass('w-64')
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(container.querySelector('aside')).toHaveClass('w-18')
    expect(localStorage.getItem('votrix.sidebar.collapsed')).toBe('true')
  })
})

describe('participant profile (read-only)', () => {
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }))

  it('shows that a student is a Student, with no officer rows when they have no organization', () => {
    user = { ...user, firstName: 'Ana', lastName: 'Cruz', schoolId: '2024-1', program: 'BSIT' }
    renderAt('/participant')
    openMenu()
    expect(screen.getByText('Account type').nextSibling).toHaveTextContent('Student')
    expect(screen.getByText('School ID')).toBeInTheDocument()
    expect(screen.queryByText('Member of')).not.toBeInTheDocument()
    expect(screen.getByText(/managed by an administrator/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows the organization a student officer belongs to, and their position', () => {
    user = { ...user, firstName: 'Ana', lastName: 'Cruz', officership }
    renderAt('/participant')
    openMenu()
    expect(screen.getByText('Member of').nextSibling).toHaveTextContent('Computing Society')
    expect(screen.getByText('Position').nextSibling).toHaveTextContent('President')
  })

  it('shows that a judge is a Judge', () => {
    user = { ...user, participantTypes: ['JUDGE'], firstName: 'Sam', lastName: 'Lee', profileData: { expertise: 'Design' } }
    renderAt('/participant')
    openMenu()
    expect(screen.getByText('Account type').nextSibling).toHaveTextContent('Judge')
    expect(screen.getByText('Expertise')).toBeInTheDocument()
  })
})
