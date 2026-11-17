import { beforeEach, describe, expect, test, vi } from 'vitest'
import { IDS, activeOfficerRow, makeWorld } from '../helpers/officer-world.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))

import { requireOwnerOrganizer, resolveOrganizerContext } from '../../src/middleware/organizerContext.js'
import { authorize, requireActiveAccount, requirePasswordChanged } from '../../src/middleware/auth.js'
import { getActor, runWithActor } from '../../src/foundation/requestContext.js'
import { recordAudit } from '../../src/foundation/audit.js'
import { deactivateOfficer } from '../../src/services/organization-officer.service.js'

// A request as authenticate() would have left it: the token's own identity.
const asStudent = (id = IDS.S1, overrides = {}) => ({
  user: {
    id, role: 'participant', email: 'student1@example.com',
    accountStatus: 'active', mustChangePassword: false, tokenVersion: 0, sessionId: 'sess-1',
    ...overrides,
  },
})

// Runs the middleware and reports what next() received (and the actor visible inside it).
function run(middleware, req) {
  return new Promise((resolve) => {
    const result = { req }
    middleware(req, {}, (error) => {
      result.error = error
      result.actorInside = getActor()
      // The context must also survive an await inside the downstream chain.
      Promise.resolve().then(() => { result.actorAfterAwait = getActor(); resolve(result) })
    })
  })
}

async function through(middleware, req) {
  const { error } = await run(middleware, req)
  return error
}

beforeEach(() => {
  world = makeWorld()
  world.raw('organization_officers').push(activeOfficerRow(IDS.S1, IDS.ORG, { position: 'President' }))
})

describe('resolveOrganizerContext', () => {
  test('an active officer acts as the owner organizer', async () => {
    const req = asStudent()
    const { error } = await run(resolveOrganizerContext, req)

    expect(error).toBeUndefined()
    expect(req.user).toMatchObject({
      id: IDS.ORG,
      role: 'organizer',
      email: 'org@example.com',
      tokenVersion: 7, // the OWNER's version, so requireActiveAccount accepts it
      mustChangePassword: false,
      sessionId: 'sess-1',
    })
    expect(req.actor).toMatchObject({ id: IDS.S1, email: 'student1@example.com', position: 'President', organizerId: IDS.ORG })
  })

  test('the real actor is available to code that never sees req, across awaits', async () => {
    const result = await run(resolveOrganizerContext, asStudent())
    expect(result.actorInside).toMatchObject({ id: IDS.S1 })
    expect(result.actorAfterAwait).toMatchObject({ id: IDS.S1 })
    expect(getActor()).toBeNull() // and it does not leak outside the request
  })

  test('organizers pass through completely unchanged', async () => {
    const req = { user: { id: IDS.ORG, role: 'organizer', tokenVersion: 7, mustChangePassword: false } }
    const before = { ...req.user }
    const { error, actorInside } = await run(resolveOrganizerContext, req)

    expect(error).toBeUndefined()
    expect(req.user).toEqual(before)
    expect(req.actor).toBeUndefined()
    expect(actorInside).toBeNull()
  })

  test('admins and unauthenticated requests pass through (authorize decides)', async () => {
    const admin = { user: { id: IDS.ADMIN, role: 'admin' } }
    expect(await through(resolveOrganizerContext, admin)).toBeUndefined()
    expect(admin.user.role).toBe('admin')
    expect(await through(resolveOrganizerContext, {})).toBeUndefined()
  })

  test('a student with no officership is untouched and is then refused by authorize(organizer)', async () => {
    const req = asStudent(IDS.S3)
    expect(await through(resolveOrganizerContext, req)).toBeUndefined()
    expect(req.user.role).toBe('participant')
    expect(req.actor).toBeUndefined()

    const denied = await through(authorize('organizer'), req)
    expect(denied.statusCode).toBe(403)
  })

  test('deactivation takes effect on the very next request', async () => {
    const first = asStudent()
    await run(resolveOrganizerContext, first)
    expect(first.user.role).toBe('organizer')

    await deactivateOfficer(IDS.ORG, world.rows('organization_officers')[0].id, IDS.ORG)

    const second = asStudent()
    await run(resolveOrganizerContext, second)
    expect(second.user.role).toBe('participant')
    expect((await through(authorize('organizer'), second)).statusCode).toBe(403)
  })

  test('the owner being suspended or archived blocks the officer', async () => {
    for (const status of ['suspended', 'archived']) {
      world.raw('users').find((u) => u.id === IDS.ORG).account_status = status
      const err = await through(resolveOrganizerContext, asStudent())
      expect(err.statusCode).toBe(403)
      expect(err.message).toMatch(/not currently active/)
    }
  })

  test('the officer’s own account being suspended blocks them', async () => {
    world.raw('users').find((u) => u.id === IDS.S1).account_status = 'suspended'
    const err = await through(resolveOrganizerContext, asStudent())
    expect(err.statusCode).toBe(403)
    expect(err.message).toMatch(/Your account is not active/)
  })

  test('an officer who still has a temporary password must change it first', async () => {
    const err = await through(resolveOrganizerContext, asStudent(IDS.S1, { mustChangePassword: true }))
    expect(err.statusCode).toBe(403)
    expect(err.details).toMatchObject({ code: 'MUST_CHANGE_PASSWORD' })
  })

  test('an officership pointing at a non-organizer account is refused', async () => {
    world.raw('users').find((u) => u.id === IDS.ORG).role = 'participant'
    expect((await through(resolveOrganizerContext, asStudent())).statusCode).toBe(403)
  })

  test('fails closed when the officership lookup errors', async () => {
    world.failNext('organization_officers', 'select', 'db down')
    const req = asStudent()
    const err = await through(resolveOrganizerContext, req)

    expect(err.statusCode).toBe(500)
    expect(req.user.role).toBe('participant') // not elevated
  })

  test('the rest of the real chain accepts the delegate (requireActiveAccount, requirePasswordChanged)', async () => {
    const req = asStudent()
    await run(resolveOrganizerContext, req)

    expect(await through(authorize('organizer'), req)).toBeUndefined()
    expect(await through(requireActiveAccount, req)).toBeUndefined()
    expect(await through(requirePasswordChanged, req)).toBeUndefined()
  })

  test('requireActiveAccount still rejects a delegate if the OWNER’s sessions were revoked', async () => {
    const req = asStudent()
    await run(resolveOrganizerContext, req)
    world.raw('users').find((u) => u.id === IDS.ORG).token_version = 8 // owner logged out everywhere

    expect((await through(requireActiveAccount, req)).statusCode).toBe(401)
  })
})

describe('requireOwnerOrganizer', () => {
  test('blocks an officer and allows the real organizer', async () => {
    const delegate = asStudent()
    await run(resolveOrganizerContext, delegate)
    const err = await through(requireOwnerOrganizer, delegate)
    expect(err.statusCode).toBe(403)
    expect(err.message).toMatch(/Only the organizer account/)

    expect(await through(requireOwnerOrganizer, { user: { id: IDS.ORG, role: 'organizer' } })).toBeUndefined()
  })
})

describe('audit attribution', () => {
  test('inside an officer request the owner stays user_id and the real person is recorded', async () => {
    await runWithActor({ id: IDS.S1, email: 'student1@example.com' }, () =>
      recordAudit({ userId: IDS.ORG, action: 'election.event.create', entity: 'events', details: { title: 'X' } }),
    )
    expect(world.rows('audit_logs')[0]).toMatchObject({
      user_id: IDS.ORG,
      details: { title: 'X', actingUserId: IDS.S1, actingUserEmail: 'student1@example.com' },
    })
  })

  test('works when the call had no details of its own', async () => {
    await runWithActor({ id: IDS.S1 }, () => recordAudit({ userId: IDS.ORG, action: 'a.b' }))
    expect(world.rows('audit_logs')[0].details).toEqual({ actingUserId: IDS.S1, actingUserEmail: null })
  })

  test('is unchanged for everyone else', async () => {
    await recordAudit({ userId: IDS.ORG, action: 'a.b', details: { k: 1 } })
    await recordAudit({ userId: IDS.ORG, action: 'a.c' })
    const [one, two] = world.rows('audit_logs')
    expect(one.details).toEqual({ k: 1 })
    expect(two.details).toBeNull()
  })
})
