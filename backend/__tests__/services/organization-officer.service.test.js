import { beforeEach, describe, expect, test, vi } from 'vitest'
import { IDS, activeOfficerRow, makeWorld } from '../helpers/officer-world.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))
// The backend loads a real .env, so the mailer is ALWAYS mocked here: assigning
// an officer sends a notification email and a test must never reach a real provider.
vi.mock('../../src/services/mailer.service.js', () => ({ sendOfficerAssignedEmail: vi.fn() }))
import { sendOfficerAssignedEmail } from '../../src/services/mailer.service.js'

import {
  activateOfficer,
  adminDeactivateOfficer,
  adminListOfficers,
  assignOfficer,
  deactivateOfficer,
  findActiveOfficership,
  listCandidates,
  listOfficers,
  resolveOfficerContext,
  toOfficershipDto,
  updateOfficerPosition,
} from '../../src/services/organization-officer.service.js'

const MISSING = '00000000-0000-4000-8000-00000000ffff'

async function rejection(promise) {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected the promise to reject')
}

const officers = () => world.rows('organization_officers')
const assign = (studentId = IDS.S1, position = 'President', organizerId = IDS.ORG) =>
  assignOfficer(organizerId, { studentId, position }, organizerId)

beforeEach(() => {
  world = makeWorld()
  vi.mocked(sendOfficerAssignedEmail).mockReset().mockResolvedValue({ sent: true })
})

describe('officer notification email', () => {
  test('assigning emails the student once, with the organization and position', async () => {
    const { email } = await assign(IDS.S1, 'President')

    expect(email).toEqual({ sent: true })
    expect(sendOfficerAssignedEmail).toHaveBeenCalledTimes(1)
    expect(sendOfficerAssignedEmail).toHaveBeenCalledWith({
      email: 'student1@example.com',
      studentName: 'First1 Last1',
      organizationName: 'Computing Society',
      position: 'President',
    })
  })

  test('a failed or blocked email never fails the assignment, and is reported', async () => {
    sendOfficerAssignedEmail.mockResolvedValueOnce({ sent: false, skipped: true, reason: 'Email service not configured' })
    const skipped = await assign(IDS.S1, 'President')
    expect(skipped.officer.status).toBe('active')
    expect(skipped.email).toMatchObject({ sent: false, skipped: true })

    sendOfficerAssignedEmail.mockRejectedValueOnce(new Error('provider down'))
    const thrown = await assign(IDS.S3, 'Secretary')
    expect(thrown.officer.status).toBe('active')
    expect(thrown.email).toMatchObject({ sent: false, error: 'provider down' })
    expect(officers()).toHaveLength(2)
  })

  test('reactivation emails again; rejected attempts send nothing', async () => {
    const { officer } = await assign(IDS.S1, 'President')
    await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)
    sendOfficerAssignedEmail.mockClear()

    await activateOfficer(IDS.ORG, officer.id, IDS.ORG)
    expect(sendOfficerAssignedEmail).toHaveBeenCalledTimes(1)

    sendOfficerAssignedEmail.mockClear()
    await rejection(assign(IDS.S2)) // outside scope
    await rejection(assign(IDS.JUDGE)) // not a student
    await rejection(assign(IDS.S1)) // already active
    expect(sendOfficerAssignedEmail).not.toHaveBeenCalled()
  })

  test('does not email on position edits or deactivation', async () => {
    const { officer } = await assign(IDS.S1, 'President')
    sendOfficerAssignedEmail.mockClear()
    await updateOfficerPosition(IDS.ORG, officer.id, 'Chair')
    await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)
    expect(sendOfficerAssignedEmail).not.toHaveBeenCalled()
  })
})

describe('assignOfficer', () => {
  test('assigns an eligible, in-scope student and audits it', async () => {
    const { officer } = await assign(IDS.S1, '  President ')

    expect(officer).toMatchObject({
      organizerId: IDS.ORG,
      studentId: IDS.S1,
      position: 'President',
      status: 'active',
      student: { id: IDS.S1, program: 'BSCS', schoolId: '2024-0001' },
    })
    expect(officers()).toHaveLength(1)
    expect(world.rows('audit_logs')[0]).toMatchObject({ action: 'organizer.officer.assign', user_id: IDS.ORG })
  })

  test.each([
    ['an unknown id', MISSING],
    ['a judge account (not a student)', IDS.JUDGE],
    ['an archived student', IDS.ARCHIVED],
    ['an organizer account', IDS.ORG2],
  ])('rejects %s with a uniform 404', async (_label, studentId) => {
    const err = await rejection(assign(studentId))
    expect(err.statusCode).toBe(404)
    expect(err.message).toBe('Student not found')
    expect(officers()).toHaveLength(0)
  })

  test('rejects a student outside the organizer scope', async () => {
    const err = await rejection(assign(IDS.S2)) // BSIT, organizer is BSCS only
    expect(err.statusCode).toBe(403)
    expect(err.message).toMatch(/outside your access scope/)
  })

  test('an all-access organizer can assign any program', async () => {
    await expect(assign(IDS.S2, 'Treasurer', IDS.ORG2)).resolves.toBeTruthy()
  })

  test('one active officership per student, across organizations', async () => {
    await assign(IDS.S1, 'President', IDS.ORG)
    world = world // same world
    const again = await rejection(assign(IDS.S1, 'Member', IDS.ORG))
    expect(again.statusCode).toBe(409)
    expect(again.message).toMatch(/already an active officer/)

    // ORG2 is all-access, so scope is not the obstacle — the existing officership is.
    const other = await rejection(assign(IDS.S1, 'Member', IDS.ORG2))
    expect(other.statusCode).toBe(409)
    expect(other.message).toMatch(/another organization/)
  })

  test('validates the position and the id', async () => {
    expect((await rejection(assign(IDS.S1, '   '))).details.errors).toContain('position is required')
    expect((await rejection(assign(IDS.S1, 'x'.repeat(256)))).statusCode).toBe(400)
    expect((await rejection(assign('not-a-uuid'))).statusCode).toBe(400)
  })

  test('re-assigning a deactivated officer reuses the row instead of duplicating it', async () => {
    const { officer } = await assign(IDS.S1, 'President')
    await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)

    const again = await assign(IDS.S1, 'Vice President')
    expect(officers()).toHaveLength(1)
    expect(again.officer).toMatchObject({ id: officer.id, status: 'active', position: 'Vice President', deactivatedAt: null })
    expect(world.rows('audit_logs').map((r) => r.action)).toContain('organizer.officer.reassign')
  })

  test('a concurrent duplicate caught by the unique index becomes a 409', async () => {
    world.failNext('organization_officers', 'insert', 'duplicate key', '23505')
    const err = await rejection(assign(IDS.S1))
    expect(err.statusCode).toBe(409)
  })
})

describe('listOfficers', () => {
  beforeEach(() => {
    world.raw('organization_officers').push(
      activeOfficerRow(IDS.S1, IDS.ORG, { position: 'President', assigned_at: '2026-01-02T00:00:00.000Z' }),
      activeOfficerRow(IDS.S3, IDS.ORG, { status: 'inactive', position: 'Secretary', assigned_at: '2026-01-01T00:00:00.000Z' }),
      activeOfficerRow(IDS.S2, IDS.ORG2, { position: 'Not mine' }),
    )
  })

  test('lists only the organizer’s own officers with student details, newest first', async () => {
    const { officers: list } = await listOfficers(IDS.ORG)
    expect(list.map((o) => o.position)).toEqual(['President', 'Secretary'])
    expect(list[0].student).toMatchObject({ email: 'student1@example.com', firstName: 'First1' })
    expect(JSON.stringify(list)).not.toContain('Not mine')
  })

  test('filters by status', async () => {
    expect((await listOfficers(IDS.ORG, { status: 'active' })).officers.map((o) => o.position)).toEqual(['President'])
    expect((await listOfficers(IDS.ORG, { status: 'inactive' })).officers.map((o) => o.position)).toEqual(['Secretary'])
    expect((await rejection(listOfficers(IDS.ORG, { status: 'bogus' }))).statusCode).toBe(400)
  })

  test('the admin listing returns the same shape for any organizer', async () => {
    expect((await adminListOfficers(IDS.ORG2)).officers.map((o) => o.position)).toEqual(['Not mine'])
  })
})

describe('updateOfficerPosition', () => {
  test('updates the position and audits it', async () => {
    const { officer } = await assign()
    const updated = await updateOfficerPosition(IDS.ORG, officer.id, 'Chairperson')
    expect(updated.officer.position).toBe('Chairperson')
    expect(world.rows('audit_logs').map((r) => r.action)).toContain('organizer.officer.position')
  })

  test('cannot touch another organizer’s officer, and validates', async () => {
    const { officer } = await assign()
    expect((await rejection(updateOfficerPosition(IDS.ORG2, officer.id, 'Hijack'))).statusCode).toBe(404)
    expect(officers()[0].position).toBe('President')
    expect((await rejection(updateOfficerPosition(IDS.ORG, officer.id, ' '))).statusCode).toBe(400)
  })
})

describe('deactivateOfficer / activateOfficer', () => {
  test('deactivation is immediate and findActiveOfficership stops returning the student', async () => {
    const { officer } = await assign()
    expect(await findActiveOfficership(IDS.S1)).toBeTruthy()

    const out = await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)

    expect(out.officer).toMatchObject({ status: 'inactive', deactivatedBy: IDS.ORG })
    expect(await findActiveOfficership(IDS.S1)).toBeNull()
  })

  test('deactivating twice conflicts; an unknown or foreign id is 404', async () => {
    const { officer } = await assign()
    await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)
    expect((await rejection(deactivateOfficer(IDS.ORG, officer.id, IDS.ORG))).statusCode).toBe(409)
    expect((await rejection(deactivateOfficer(IDS.ORG, MISSING, IDS.ORG))).statusCode).toBe(404)
    expect((await rejection(deactivateOfficer(IDS.ORG2, officer.id, IDS.ORG2))).statusCode).toBe(404)
  })

  test('an admin override deactivates and is audited as such', async () => {
    const { officer } = await assign()
    await adminDeactivateOfficer(IDS.ORG, officer.id, IDS.ADMIN)

    expect(officers()[0]).toMatchObject({ status: 'inactive', deactivated_by: IDS.ADMIN })
    const audit = world.rows('audit_logs').find((r) => r.action === 'organizer.officer.deactivate')
    expect(audit).toMatchObject({ user_id: IDS.ADMIN, details: { byAdmin: true, organizerId: IDS.ORG } })
  })

  test('reactivation works and clears the deactivation fields', async () => {
    const { officer } = await assign()
    await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)

    const out = await activateOfficer(IDS.ORG, officer.id, IDS.ORG)

    expect(out.officer).toMatchObject({ status: 'active', deactivatedAt: null, deactivatedBy: null })
    expect((await rejection(activateOfficer(IDS.ORG, officer.id, IDS.ORG))).statusCode).toBe(409)
  })

  test('reactivation re-checks scope: a student moved out of scope is refused', async () => {
    const { officer } = await assign(IDS.S1)
    await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)
    world.raw('users').find((u) => u.id === IDS.S1).program = 'BSIT'

    const err = await rejection(activateOfficer(IDS.ORG, officer.id, IDS.ORG))
    expect(err.statusCode).toBe(403)
    expect(officers()[0].status).toBe('inactive')
  })

  test('reactivation is refused if the student became an officer elsewhere', async () => {
    const { officer } = await assign(IDS.S1)
    await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)
    await assign(IDS.S1, 'Treasurer', IDS.ORG2)

    const err = await rejection(activateOfficer(IDS.ORG, officer.id, IDS.ORG))
    expect(err.statusCode).toBe(409)
  })

  test('reactivation is refused if the student account was archived meanwhile', async () => {
    const { officer } = await assign(IDS.S1)
    await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)
    world.raw('users').find((u) => u.id === IDS.S1).account_status = 'archived'

    expect((await rejection(activateOfficer(IDS.ORG, officer.id, IDS.ORG))).statusCode).toBe(404)
  })
})

describe('listCandidates', () => {
  const emails = async (organizerId, options) =>
    (await listCandidates(organizerId, options)).candidates.map((c) => c.email).sort()

  test('only eligible, active, in-scope students', async () => {
    // ORG is BSCS-only: S1 and S3. Not S2 (BSIT), the judge, or the archived student.
    expect(await emails(IDS.ORG)).toEqual(['student1@example.com', 'student3@example.com'])
  })

  test('an all-access organizer sees every eligible student', async () => {
    expect(await emails(IDS.ORG2)).toEqual(['student1@example.com', 'student2@example.com', 'student3@example.com'])
  })

  test('excludes students who are already active officers anywhere', async () => {
    await assign(IDS.S1, 'President', IDS.ORG)
    expect(await emails(IDS.ORG)).toEqual(['student3@example.com'])
    expect(await emails(IDS.ORG2)).toEqual(['student2@example.com', 'student3@example.com'])
  })

  test('an inactive officer becomes a candidate again', async () => {
    const { officer } = await assign(IDS.S1)
    await deactivateOfficer(IDS.ORG, officer.id, IDS.ORG)
    expect(await emails(IDS.ORG)).toContain('student1@example.com')
  })

  test('searches by name, email and school id, and strips filter-breaking characters', async () => {
    expect(await emails(IDS.ORG2, { search: 'first2' })).toEqual(['student2@example.com'])
    expect(await emails(IDS.ORG2, { search: '2024-0003' })).toEqual(['student3@example.com'])
    expect(await emails(IDS.ORG2, { search: 'student1@' })).toEqual(['student1@example.com'])
    expect(await emails(IDS.ORG2, { search: '(first2),' })).toEqual(['student2@example.com'])
  })

  test('respects the limit even when some students are already taken', async () => {
    await assign(IDS.S1, 'President', IDS.ORG)
    const { candidates } = await listCandidates(IDS.ORG2, { limit: 1 })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].id).not.toBe(IDS.S1)
  })

  test('returns a minimal student shape', async () => {
    const [c] = (await listCandidates(IDS.ORG, { limit: 1 })).candidates
    expect(Object.keys(c).sort()).toEqual(['email', 'firstName', 'id', 'lastName', 'program', 'schoolId'])
  })
})

describe('resolveOfficerContext', () => {
  test('returns null for a student with no officership', async () => {
    expect(await resolveOfficerContext(IDS.S1)).toBeNull()
  })

  test('returns the officership with its owner, and a client-safe DTO', async () => {
    await assign(IDS.S1, 'President')
    const ctx = await resolveOfficerContext(IDS.S1)

    expect(ctx.owner.id).toBe(IDS.ORG)
    expect(toOfficershipDto(ctx)).toEqual({
      organizerId: IDS.ORG,
      organizationName: 'Computing Society',
      organizerName: 'Ada Lovelace',
      position: 'President',
    })
  })

  test('never fails open: a database error is thrown, not read as "no officership"', async () => {
    world.failNext('organization_officers', 'select', 'db down')
    await expect(findActiveOfficership(IDS.S1)).rejects.toMatchObject({ statusCode: 500 })
  })
})
