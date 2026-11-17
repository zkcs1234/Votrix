import { beforeEach, describe, expect, test, vi } from 'vitest'
import request from 'supertest'
import { IDS, activeOfficerRow, makeWorld } from '../helpers/officer-world.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))
// Assigning an officer sends an email. The backend loads a real .env, so make
// sure this test can never reach a real mail provider.
vi.mock('../../src/services/mailer.service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendOfficerAssignedEmail: vi.fn(async () => ({ sent: true })),
}))

import { createApp } from '../../src/app.js'
import { signAccessToken } from '../../src/utils/jwt.js'
import { buildTokenPayload } from '../../src/services/token.service.js'
import { env } from '../../src/config/env.js'

const CSRF = 'c'.repeat(40)
// createApp() reads the DB client while it builds, so a world must already exist.
world = makeWorld()
const app = createApp()

// Authenticate as a seeded account exactly as the browser would: signed access
// cookie + matching CSRF cookie/header.
function as(userId) {
  const row = world.raw('users').find((u) => u.id === userId)
  const token = signAccessToken(buildTokenPayload(row))
  const cookie = `${env.jwt.accessCookieName}=${token}; ${env.csrf.cookieName}=${CSRF}`
  const withAuth = (req) => req.set('Cookie', cookie).set(env.csrf.headerName, CSRF)
  return {
    get: (url) => withAuth(request(app).get(url)),
    post: (url, body) => withAuth(request(app).post(url)).send(body ?? {}),
    put: (url, body) => withAuth(request(app).put(url)).send(body ?? {}),
    patch: (url, body) => withAuth(request(app).patch(url)).send(body ?? {}),
  }
}

beforeEach(() => {
  world = makeWorld({ orgScope: { scopeType: 'all', programs: [], sections: [] } })
  world.raw('organization_officers').push(activeOfficerRow(IDS.S1, IDS.ORG, { position: 'President' }))
})

describe('organizer router: student officers act as the owner', () => {
  test('an active officer can use the organizer API and sees the OWNER’s data', async () => {
    const res = await as(IDS.S1).get('/api/organizer/profile')

    expect(res.status).toBe(200)
    expect(res.body.profile).toMatchObject({ organizationName: 'Computing Society' })
    expect(JSON.stringify(res.body)).not.toContain('student1@example.com')
  })

  test('the real organizer is unaffected', async () => {
    const res = await as(IDS.ORG).get('/api/organizer/profile')
    expect(res.status).toBe(200)
    expect(res.body.profile).toMatchObject({ organizationName: 'Computing Society' })
  })

  test('a student who is not an officer is refused', async () => {
    const res = await as(IDS.S3).get('/api/organizer/profile')
    expect(res.status).toBe(403)
  })

  test('an unauthenticated request is still 401', async () => {
    expect((await request(app).get('/api/organizer/profile')).status).toBe(401)
  })

  test('officers cannot edit the owner’s profile', async () => {
    const res = await as(IDS.S1).put('/api/organizer/profile', {
      organizationName: 'Hijacked', organizationType: 'x', organizerName: 'x', position: 'x',
    })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Only the organizer account/)
    expect(world.raw('users').find((u) => u.id === IDS.ORG).organization_name).toBe('Computing Society')
  })

  test('the organizer cannot edit their own profile either: only an administrator can', async () => {
    const res = await as(IDS.ORG).put('/api/organizer/profile', {
      organizationName: 'Renamed', organizationType: 'Co-curricular', organizerName: 'New Name', position: 'Chair',
    })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/managed by an administrator/)
    expect(world.raw('users').find((u) => u.id === IDS.ORG).organization_name).toBe('Computing Society')
  })

  test('a student has no way to edit their own profile fields', async () => {
    const before = JSON.stringify(world.raw('users').find((u) => u.id === IDS.S1))
    for (const url of ['/api/participant/profile', '/api/auth/me', '/api/auth/profile', '/api/voter/profile']) {
      for (const method of ['put', 'patch']) {
        const res = await as(IDS.S1)[method](url, { firstName: 'Hacked', lastName: 'Hacked', schoolId: 'X', program: 'X' })
        expect(res.status).toBeGreaterThanOrEqual(400)
      }
    }
    expect(JSON.stringify(world.raw('users').find((u) => u.id === IDS.S1))).toBe(before)
  })

  test('officers cannot manage officers, but the owner can', async () => {
    const officer = as(IDS.S1)
    expect((await officer.get('/api/organizer/officers')).status).toBe(403)
    expect((await officer.get('/api/organizer/officers/candidates')).status).toBe(403)
    expect((await officer.post('/api/organizer/officers', { studentId: IDS.S3, position: 'Aide' })).status).toBe(403)
    expect(world.rows('organization_officers')).toHaveLength(1)

    const list = await as(IDS.ORG).get('/api/organizer/officers?status=active')
    expect(list.status).toBe(200)
    expect(list.body.officers.map((o) => o.position)).toEqual(['President'])
  })

  test('the owner assigns an officer, who can then use the workspace immediately', async () => {
    expect((await as(IDS.S3).get('/api/organizer/profile')).status).toBe(403)

    const assigned = await as(IDS.ORG).post('/api/organizer/officers', { studentId: IDS.S3, position: 'Secretary' })
    expect(assigned.status).toBe(201)
    expect(assigned.body.officer).toMatchObject({ studentId: IDS.S3, position: 'Secretary', status: 'active' })

    expect((await as(IDS.S3).get('/api/organizer/profile')).status).toBe(200)
  })

  test('deactivating an officer cuts access on their very next request', async () => {
    expect((await as(IDS.S1).get('/api/organizer/profile')).status).toBe(200)

    const officerId = world.rows('organization_officers')[0].id
    const off = await as(IDS.ORG).post(`/api/organizer/officers/${officerId}/deactivate`)
    expect(off.status).toBe(200)

    expect((await as(IDS.S1).get('/api/organizer/profile')).status).toBe(403)
  })

  test('suspending the owner locks its officers out', async () => {
    world.raw('users').find((u) => u.id === IDS.ORG).account_status = 'suspended'
    expect((await as(IDS.S1).get('/api/organizer/profile')).status).toBe(403)
  })

  test('candidate search and out-of-scope assignment are enforced server-side', async () => {
    world = makeWorld() // ORG is BSCS-only here
    const owner = as(IDS.ORG)

    const found = await owner.get('/api/organizer/officers/candidates')
    expect(found.body.candidates.map((c) => c.email).sort()).toEqual(['student1@example.com', 'student3@example.com'])

    const crafted = await owner.post('/api/organizer/officers', { studentId: IDS.S2, position: 'Aide' }) // BSIT
    expect(crafted.status).toBe(403)
    expect(world.rows('organization_officers')).toHaveLength(0)
  })

  test('an organizer cannot manage another organizer’s officers', async () => {
    const officerId = world.rows('organization_officers')[0].id
    const res = await as(IDS.ORG2).post(`/api/organizer/officers/${officerId}/deactivate`)
    expect(res.status).toBe(404)
    expect(world.rows('organization_officers')[0].status).toBe('active')
  })

  test('an officer creates an event in the OWNER’s organization, audited with the real person', async () => {
    const created = await as(IDS.S1).post('/api/organizer/election/events', {
      title: 'Student Council Election',
      startDate: '2030-01-01T08:00:00.000Z',
      endDate: '2030-01-02T08:00:00.000Z',
    })
    expect(created.status).toBe(201)

    // The event belongs to the owner's organization, not to the student.
    const [event] = world.rows('events')
    const org = world.rows('organizations').find((o) => o.id === event.organization_id)
    expect(org.organizer_id).toBe(IDS.ORG)

    // user_id stays the owner; the real person is in details.
    const audit = world.rows('audit_logs').find((r) => r.action === 'election.event.create')
    expect(audit).toMatchObject({
      user_id: IDS.ORG,
      details: { actingUserId: IDS.S1, actingUserEmail: 'student1@example.com' },
    })
  })

  test('actions by the owner carry no acting-user marker', async () => {
    await as(IDS.ORG).post('/api/organizer/officers', { studentId: IDS.S3, position: 'Aide' })
    const audit = world.rows('audit_logs').find((r) => r.action === 'organizer.officer.assign')
    expect(audit.details.actingUserId).toBeUndefined()
  })
})

describe('/api/auth/me', () => {
  test('tells an active officer which organization they act for', async () => {
    const res = await as(IDS.S1).get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.user.officership).toEqual({
      organizerId: IDS.ORG,
      organizationName: 'Computing Society',
      organizerName: 'Ada Lovelace',
      position: 'President',
    })
  })

  test('is null for a student who is not an officer, and absent for organizers', async () => {
    expect((await as(IDS.S3).get('/api/auth/me')).body.user.officership).toBeNull()
    expect((await as(IDS.ORG).get('/api/auth/me')).body.user).not.toHaveProperty('officership')
  })

  test('is null once the officer is deactivated or the owner is suspended', async () => {
    world.raw('users').find((u) => u.id === IDS.ORG).account_status = 'suspended'
    expect((await as(IDS.S1).get('/api/auth/me')).body.user.officership).toBeNull()
  })
})

describe('admin override', () => {
  test('an admin can list and deactivate an organizer’s officers', async () => {
    const admin = as(IDS.ADMIN)
    const list = await admin.get(`/api/admin/organizers/${IDS.ORG}/officers`)
    expect(list.status).toBe(200)
    expect(list.body.officers).toHaveLength(1)

    const officerId = list.body.officers[0].id
    const off = await admin.post(`/api/admin/organizers/${IDS.ORG}/officers/${officerId}/deactivate`)
    expect(off.status).toBe(200)
    expect(world.rows('organization_officers')[0]).toMatchObject({ status: 'inactive', deactivated_by: IDS.ADMIN })
    expect((await as(IDS.S1).get('/api/organizer/profile')).status).toBe(403)
  })

  test('organizers and students cannot use the admin endpoints', async () => {
    expect((await as(IDS.ORG).get(`/api/admin/organizers/${IDS.ORG}/officers`)).status).toBe(403)
    expect((await as(IDS.S1).get(`/api/admin/organizers/${IDS.ORG}/officers`)).status).toBe(403)
  })
})
