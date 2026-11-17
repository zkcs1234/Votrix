import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

let auth
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))

const officership = { organizerId: 'org-1', organizationName: 'Computing Society', position: 'President' }
const signedIn = (user, extra = {}) => ({
  isAuthenticated: true,
  isBootstrapping: false,
  mustChangePassword: false,
  role: user.role,
  user,
  ...extra,
})

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/participant" element={<p>Student area</p>} />
        <Route path="/organizer" element={<ProtectedRoute allowedRoles={['organizer']}><p>Organizer area</p></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><p>Admin area</p></ProtectedRoute>} />
        <Route path="/participant/events" element={<ProtectedRoute allowedRoles={['participant']}><p>Student events</p></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  auth = null
})

describe('ProtectedRoute and student officers', () => {
  it('lets an active officer into organizer pages', () => {
    auth = signedIn({ id: 's1', role: 'participant', officership })
    renderAt('/organizer')
    expect(screen.getByText('Organizer area')).toBeInTheDocument()
  })

  it('keeps a plain student out of organizer pages and sends them to their own area', () => {
    auth = signedIn({ id: 's2', role: 'participant', officership: null })
    renderAt('/organizer')
    expect(screen.queryByText('Organizer area')).not.toBeInTheDocument()
    expect(screen.getByText('Student area')).toBeInTheDocument()
  })

  it('an officer whose officership has been removed is sent back to the student area', () => {
    auth = signedIn({ id: 's1', role: 'participant', officership: null })
    renderAt('/organizer')
    expect(screen.getByText('Student area')).toBeInTheDocument()
  })

  it('an officer is still not an administrator', () => {
    auth = signedIn({ id: 's1', role: 'participant', officership })
    renderAt('/admin')
    expect(screen.queryByText('Admin area')).not.toBeInTheDocument()
    expect(screen.getByText('Student area')).toBeInTheDocument()
  })

  it('an officer keeps ordinary participant access', () => {
    auth = signedIn({ id: 's1', role: 'participant', officership })
    renderAt('/participant/events')
    expect(screen.getByText('Student events')).toBeInTheDocument()
  })

  it('a stray officership on a non-participant account grants nothing', () => {
    auth = signedIn({ id: 'a1', role: 'admin', officership })
    renderAt('/organizer')
    expect(screen.queryByText('Organizer area')).not.toBeInTheDocument()
  })

  it('real organizers are unaffected', () => {
    auth = signedIn({ id: 'o1', role: 'organizer' })
    renderAt('/organizer')
    expect(screen.getByText('Organizer area')).toBeInTheDocument()
  })

  it('an unauthenticated visitor still goes to login', () => {
    auth = { isAuthenticated: false, isBootstrapping: false, role: null, user: null, mustChangePassword: false }
    renderAt('/organizer')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })
})
