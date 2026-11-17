import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import LegacyUserManagementRedirect, { resolveUserManagementRedirect } from './LegacyUserManagementRedirect'

describe('resolveUserManagementRedirect', () => {
  it.each([
    ['', '/admin/organizers'],
    ['?tab=organizers', '/admin/organizers'],
    ['?tab=organizers&section=invitations', '/admin/organizers?section=invitations'],
    ['?tab=organizers&section=applications', '/admin/organizers?section=applications'],
    ['?tab=organizers&section=bogus', '/admin/organizers'],
    ['?tab=participants', '/admin/participants'],
    ['?tab=participants&category=judges', '/admin/participants?category=judges'],
    ['?tab=participants&category=students', '/admin/participants?category=students'],
    ['?tab=participants&category=bogus', '/admin/participants'],
    // Older URL forms from before the Students/Judges grouping.
    ['?tab=participants&type=election-voter', '/admin/participants?category=students'],
    ['?tab=participants&type=polling-respondent', '/admin/participants?category=students'],
    ['?tab=participants&type=competition-judge', '/admin/participants?category=judges'],
    ['?tab=judges', '/admin/participants?category=judges'],
    ['?tab=voters', '/admin/participants?category=students'],
  ])('%s -> %s', (search, expected) => {
    expect(resolveUserManagementRedirect(search)).toBe(expected)
  })
})

describe('LegacyUserManagementRedirect', () => {
  function Where() {
    const { pathname, search } = useLocation()
    return <p data-testid="where">{pathname + search}</p>
  }

  it('sends an old /admin/users link to the matching new page', () => {
    render(
      <MemoryRouter initialEntries={['/admin/users?tab=participants&category=judges']}>
        <Routes>
          <Route path="/admin/users" element={<LegacyUserManagementRedirect />} />
          <Route path="/admin/participants" element={<Where />} />
          <Route path="/admin/organizers" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/participants?category=judges')
  })
})
