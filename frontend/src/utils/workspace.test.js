import { describe, expect, it } from 'vitest'
import {
  canUseOrganizerWorkspace,
  effectiveWorkspaceRole,
  getOfficership,
  isOfficer,
  isOrganizerPath,
  sameOfficership,
} from './workspace'

const officership = { organizerId: 'org-1', organizationName: 'Computing Society', position: 'President' }
const officer = { id: 's1', role: 'participant', officership }
const student = { id: 's2', role: 'participant', officership: null }
const organizer = { id: 'o1', role: 'organizer' }
const admin = { id: 'a1', role: 'admin' }

describe('isOfficer / getOfficership', () => {
  it('is true only for a participant with an officership', () => {
    expect(isOfficer(officer)).toBe(true)
    expect(isOfficer({ ...officer, role: 'voter' })).toBe(true) // legacy participant role
    expect(isOfficer(student)).toBe(false)
    expect(isOfficer(organizer)).toBe(false)
    expect(isOfficer(admin)).toBe(false)
    expect(isOfficer(null)).toBe(false)
  })

  it('never lets a non-participant be an officer, even with a stray officership field', () => {
    expect(isOfficer({ role: 'admin', officership })).toBe(false)
    expect(isOfficer({ role: 'organizer', officership })).toBe(false)
  })

  it('ignores a malformed officership', () => {
    expect(getOfficership({ officership: {} })).toBeNull()
    expect(getOfficership({ officership: { position: 'x' } })).toBeNull()
    expect(getOfficership({})).toBeNull()
    expect(getOfficership(undefined)).toBeNull()
  })
})

describe('canUseOrganizerWorkspace', () => {
  it('allows organizers and officers only', () => {
    expect(canUseOrganizerWorkspace(organizer)).toBe(true)
    expect(canUseOrganizerWorkspace(officer)).toBe(true)
    expect(canUseOrganizerWorkspace(student)).toBe(false)
    expect(canUseOrganizerWorkspace(admin)).toBe(false)
  })
})

describe('isOrganizerPath', () => {
  it.each([
    ['/organizer', true],
    ['/organizer/', true],
    ['/organizer/election/events', true],
    ['/organizer/officers', true],
    ['/organizerx', false],
    ['/participant', false],
    ['/admin/organizers', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (path, expected) => {
    expect(isOrganizerPath(path)).toBe(expected)
  })
})

describe('effectiveWorkspaceRole', () => {
  it('treats an officer as an organizer only inside /organizer', () => {
    expect(effectiveWorkspaceRole(officer, '/organizer/election/events')).toBe('organizer')
    expect(effectiveWorkspaceRole(officer, '/participant')).toBe('participant')
    expect(effectiveWorkspaceRole(officer, '/participant/events/e1')).toBe('participant')
  })

  it('never changes anyone else’s role', () => {
    expect(effectiveWorkspaceRole(student, '/organizer')).toBe('participant')
    expect(effectiveWorkspaceRole(organizer, '/participant')).toBe('organizer')
    expect(effectiveWorkspaceRole(admin, '/organizer')).toBe('admin')
    expect(effectiveWorkspaceRole(null, '/organizer')).toBeNull()
  })
})

describe('sameOfficership', () => {
  it('compares by organization, position and name', () => {
    expect(sameOfficership(officership, { ...officership })).toBe(true)
    expect(sameOfficership(officership, { ...officership, position: 'Treasurer' })).toBe(false)
    expect(sameOfficership(officership, { ...officership, organizerId: 'org-2' })).toBe(false)
  })

  it('treats null, undefined and empty as the same "none"', () => {
    expect(sameOfficership(null, undefined)).toBe(true)
    expect(sameOfficership(null, {})).toBe(true)
    expect(sameOfficership(officership, null)).toBe(false)
    expect(sameOfficership(undefined, officership)).toBe(false)
  })
})
